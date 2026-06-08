import pytest
import random
from pathlib import Path
from PIL import Image
import sqlite_utils

from kb_image.models import BaseImage, ImageClasses, ImageFile
from kb_image.utils import is_valid_image, generate_image_hash, extract_exif
from kb_image.process import (
    process_file_image,
    save_image_to_database,
    hash_is_in_database,
)


def create_test_image(path: Path, width=500, height=500):
    """Create a random noise image that is guaranteed to exceed the 10 KB limit."""
    img = Image.new("RGB", (width, height))
    # Generate random noise bytes to avoid empty compression optimization
    noise_bytes = bytes(random.getrandbits(8) for _ in range(width * height * 3))
    img.frombytes(noise_bytes)
    img.save(path)


def test_models_validation():
    # Valid model initialization
    img_data = {
        "file_name": "test.png",
        "extension": "png",
        "size": 100,
        "created": "2026-05-29",
        "modified": "2026-05-29",
        "hight": 100,
        "width": 100,
        "exif_data": {"Camera": "Sony"},
        "thumbnail": "base64_thumb",
        "image": "base64_full",
        "image_hash": "hash123",
        "classification": "nature",
        "tags": ["landscape", "mountain"],
    }
    img = BaseImage(**img_data)
    assert img.file_name == "test.png"
    assert img.tags == ["landscape", "mountain"]
    assert img.classification == "nature"

    # Invalid classification
    invalid_data = img_data.copy()
    invalid_data["classification"] = "invalid_class"
    with pytest.raises(ValueError):
        BaseImage(**invalid_data)


def test_is_valid_image(tmp_path):
    # Test on a dummy non-image file
    dummy_file = tmp_path / "test.txt"
    dummy_file.write_text("not an image", encoding="utf-8")
    assert not is_valid_image(dummy_file)

    # Test with valid noise image
    img_path = tmp_path / "test.png"
    create_test_image(img_path)
    assert is_valid_image(img_path) is True


def test_generate_image_hash(tmp_path):
    fp = tmp_path / "hash.bin"
    fp.write_bytes(b"content to hash")
    h = generate_image_hash(fp)
    assert len(h) == 64


def test_process_and_save_image(tmp_path):
    # Create image file
    img_path = tmp_path / "valid.png"
    create_test_image(img_path)

    # Set up in-memory sqlite database
    db = sqlite_utils.Database(memory=True)

    # Process and save
    processed = process_file_image(img_path)
    assert processed is not None
    assert processed.file_name == "valid.png"
    assert processed.hight == 500

    # Save to db
    save_image_to_database(processed, db)

    # Check exists
    assert hash_is_in_database(processed.image_hash, db) is True


def test_process_metadata_only(tmp_path):
    # Create image file
    img_path = tmp_path / "metadata_only.png"
    create_test_image(img_path)

    # Set up in-memory sqlite database
    db = sqlite_utils.Database(memory=True)

    # Process metadata-only
    processed = process_file_image(img_path, metadata_only=True)
    assert processed is not None
    assert processed.file_name == "metadata_only.png"
    assert processed.image is None
    assert processed.thumbnail is None

    # Save to db
    save_image_to_database(processed, db)

    # Check exists
    assert hash_is_in_database(processed.image_hash, db) is True
    row = db["image_files"].get(processed.image_hash)
    assert row["image"] is None
    assert row["thumbnail"] is None


def test_cli_fill(tmp_path, mocker):
    from typer.testing import CliRunner
    from kb_image.cli import kb_image_cli

    # Create temporary database
    test_db = sqlite_utils.Database(memory=True)
    mocker.patch("kb_image.cli._db", test_db)

    # Create a test image file
    img_path = tmp_path / "test_fill.png"
    create_test_image(img_path)

    # First, insert a metadata-only record into test_db
    processed = process_file_image(img_path, metadata_only=True)
    test_db["image_files"].insert(processed.model_dump(), pk="image_hash")

    # Check database record has None for image/thumbnail
    row = test_db["image_files"].get(processed.image_hash)
    assert row["image"] is None
    assert row["thumbnail"] is None

    # Run the CLI fill command
    runner = CliRunner()
    result = runner.invoke(kb_image_cli, ["fill", "--all"])
    assert result.exit_code == 0

    # Check database record has been updated
    row = test_db["image_files"].get(processed.image_hash)
    assert row["image"] is not None
    assert row["thumbnail"] is not None


def test_cli_fill_missing_file(tmp_path, mocker):
    from typer.testing import CliRunner
    from kb_image.cli import kb_image_cli

    test_db = sqlite_utils.Database(memory=True)
    mocker.patch("kb_image.cli._db", test_db)

    # Create a test image file, process it, then delete it
    img_path = tmp_path / "test_missing.png"
    create_test_image(img_path)
    processed = process_file_image(img_path, metadata_only=True)
    test_db["image_files"].insert(processed.model_dump(), pk="image_hash")

    # Delete the file
    img_path.unlink()

    # Run the CLI fill command
    runner = CliRunner()
    result = runner.invoke(kb_image_cli, ["fill", "--all"])
    assert result.exit_code == 0

    # Check database record still has None for image/thumbnail (was not updated)
    row = test_db["image_files"].get(processed.image_hash)
    assert row["image"] is None
    assert row["thumbnail"] is None
