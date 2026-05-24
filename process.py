from typing import Iterable

import httpx
import sqlite_utils

from datetime import datetime

from models import ImageFile, WebImage
from utils import (
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
            extension=file_path.suffix.lower().lstrip("."),
            file_name=file_path.name,
            size=file_path.stat().st_size,
            created=datetime.fromtimestamp(file_path.stat().st_birthtime).isoformat(),
            modified=datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
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


def hash_is_in_database(image_hash: str, db: sqlite_utils.Database) -> bool:
    try:
        result = db["image_files"].get(image_hash)
        return result is not None
    except sqlite_utils.db.NotFoundError:
        return False
    except Exception:
        return False


def process_images_in_directory(
    directory: Path, db: sqlite_utils.Database
) -> Iterable[ImageFile]:
    for file_path in directory.rglob("*"):
        if file_path.is_file():
            image = process_file_image(file_path)
            if image and not hash_is_in_database(image.image_hash, db):
                yield image


def save_image_to_database(image: ImageFile, db: sqlite_utils.Database):
    try:
        db["image_files"].insert(
            image.model_dump(),
            pk="image_hash",
        )
    except Exception as e:
        print(f"Error saving image to database: {e}")


def save_web_image_to_database(image: WebImage, db: sqlite_utils.Database):
    try:
        db["web_images"].insert(
            image.model_dump(),
            pk="image_hash",
        )
    except Exception as e:
        print(f"Error saving web image to database: {e}")


def import_web_image(url: str, db: sqlite_utils.Database):
    try:
        resp = httpx.get(url)
        if resp.status_code == 200 and "image" in resp.headers.get("Content-Type", ""):
            img_data = resp.content
            image_hash = hashlib.sha256(img_data).hexdigest()
            if not hash_is_in_database(image_hash, db):
                thumbnail = generate_thumbnail_from_bytes(img_data)
                base64_image = base64.b64encode(img_data).decode("utf-8")
                img = Image.Image.frombytes(img_data)
                exif_data = extract_exif(img)
                height, width = img.size
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
                save_image_to_database(web_image, db)
        else:
            print(
                f"Failed to fetch image from URL: {url} - Status code: {resp.status_code}"
            )
    except Exception as e:
        print(f"Error importing web image from {url}: {e}")


def import_image_files_from_directory(directory: Path, db: sqlite_utils.Database):
    for image in process_images_in_directory(directory, db):
        save_image_to_database(image, db)


def import_image_file(file_path: Path, db: sqlite_utils.Database):
    image = process_file_image(file_path)
    if image and not hash_is_in_database(image.image_hash, db):
        save_image_to_database(image, db)
