"""
Process module for kb-image.
Handles processing of image files and web images.
"""

from typing import Iterable
import io
import httpx
import sqlite_utils
from datetime import datetime

from .models import ImageFile, WebImage
from .utils import (
    generate_thumbnail_from_bytes,
    is_valid_image,
    generate_image_hash,
    generate_thumbnail,
    generate_base64_image,
    extract_exif,
    base64,
    Image,
    hashlib,
    Path,
    Optional,
)


def process_file_image(file_path: Path) -> Optional[ImageFile]:
    """
    Process a single image file.

    Args:
        file_path: Path to the image file

    Returns:
        ImageFile object for the image
    """
    if not is_valid_image(file_path):
        print(f"Skipping invalid image: {file_path}")
        return None

    try:
        with Image.open(file_path) as img:
            width, height = img.size
            exif_data = extract_exif(img)

        image_hash = generate_image_hash(file_path)
        thumbnail = generate_thumbnail(file_path)
        base64_image = generate_base64_image(file_path)

        return ImageFile(
            path=str(file_path),
            file_name=file_path.name,
            extension=file_path.suffix.lower().lstrip("."),
            size=file_path.stat().st_size,
            created=str(datetime.fromtimestamp(file_path.stat().st_ctime)),
            modified=str(datetime.fromtimestamp(file_path.stat().st_mtime)),
            hight=height,
            width=width,
            exif_data=exif_data,
            thumbnail=thumbnail,
            image=base64_image,
            image_hash=image_hash,
            description=None,
            tags=None,
            classification=None,
        )
    except Exception as e:
        print(f"Error processing image {file_path}: {e}")
        return None


def process_images_in_directory(
    directory: Path, db: sqlite_utils.Database
) -> Iterable[ImageFile]:
    """
    Process all image files in a directory.

    Args:
        directory: Directory to process images from
        db: SQLite database

    Yields:
        ImageFile objects for each image
    """
    for file_path in directory.rglob("*"):
        if file_path.is_file():
            image = process_file_image(file_path)
            if image:
                yield image


def hash_is_in_database(image_hash: str, db: sqlite_utils.Database) -> bool:
    """
    Check if an image hash is in the database.

    Args:
        image_hash: Hash of the image
        db: SQLite database

    Returns:
        True if the image hash is in the database, False otherwise
    """
    try:
        result = db["image_files"].get(image_hash)
        return result is not None
    except sqlite_utils.utils.NotFoundError:
        # Check web_images just in case
        try:
            result = db["web_images"].get(image_hash)
            return result is not None
        except sqlite_utils.utils.NotFoundError:
            return False
    except Exception:
        return False


def save_image_to_database(image: ImageFile, db: sqlite_utils.Database):
    """
    Save an image to the database.

    Args:
        image: Image to save
        db: SQLite database
    """
    try:
        db["image_files"].insert(
            image.model_dump(),
            pk="image_hash",
            alter=True,
            replace=True,
        )
        print(f"Successfully saved image to database: {image.file_name}")
    except Exception as e:
        print(f"Error saving image to database: {e}")


def save_web_image_to_database(image: WebImage, db: sqlite_utils.Database):
    """
    Save a web image to the database.

    Args:
        image: Web image to save
        db: SQLite database
    """
    try:
        db["web_images"].insert(
            image.model_dump(),
            pk="image_hash",
            alter=True,
            replace=True,
        )
        print(f"Successfully saved web image to database: {image.file_name}")
    except Exception as e:
        print(f"Error saving web image to database: {e}")


def import_web_image(url: str, db: sqlite_utils.Database):
    """
    Import a web image into the database.

    Args:
        url: URL of the web image
        db: SQLite database
    """
    try:
        resp = httpx.get(url)
        if resp.status_code == 200 and "image" in resp.headers.get("Content-Type", ""):
            img_data = resp.content
            image_hash = hashlib.sha256(img_data).hexdigest()
            if not hash_is_in_database(image_hash, db):
                thumbnail = generate_thumbnail_from_bytes(img_data)
                base64_image = base64.b64encode(img_data).decode("utf-8")
                with Image.open(io.BytesIO(img_data)) as img:
                    exif_data = extract_exif(img) if img else None
                    height, width = img.size if img else (0, 0)
                web_image = WebImage(
                    url=url,
                    extension=url.split(".")[-1].lower(),
                    file_name=url.split("/")[-1],
                    size=len(img_data),
                    created=str(datetime.now()),
                    modified=str(datetime.now()),
                    hight=height,
                    width=width,
                    exif_data=exif_data,
                    thumbnail=thumbnail,
                    image=base64_image,
                    image_hash=image_hash,
                    description=None,
                    tags=None,
                    classification=None,
                )
                save_web_image_to_database(web_image, db)
        else:
            print(
                f"Failed to fetch image from URL: {url} - Status code: {resp.status_code}"
            )
    except Exception as e:
        print(f"Error importing web image from URL {url}: {e}")


def import_image_files_from_directory(directory: Path, db: sqlite_utils.Database):
    """
    Import all image files from a directory into the database.

    Args:
        directory: Directory to import images from
        db: SQLite database
    """
    for image in process_images_in_directory(directory, db):
        save_image_to_database(image, db)


def import_image_file(file_path: Path, db: sqlite_utils.Database):
    """
    Import a single image file into the database.

    Args:
        file_path: Path to the image file
        db: SQLite database
    """
    image = process_file_image(file_path)
    if image and not hash_is_in_database(image.image_hash, db):
        save_image_to_database(image, db)
