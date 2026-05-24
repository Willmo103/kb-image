import base64
import hashlib
import io
import os
from pathlib import Path
from typing import Optional
from PIL import ExifTags, Image
from PIL.TiffImagePlugin import TiffImageFile
from config import (
    IMAGE_FORMATS,
    MIN_SIZE_WIDTH,
    MIN_SIZE_HEIGHT,
    MIN_FILE_SIZE,
    THUMBNAIL_SIZE,
)


def is_valid_image(file_path: Path) -> bool:
    if file_path.suffix.lower() not in IMAGE_FORMATS:
        return False
    try:
        with Image.open(file_path) as img:
            width, height = img.size
            if width < MIN_SIZE_WIDTH or height < MIN_SIZE_HEIGHT:
                return False
        if file_path.stat().st_size < MIN_FILE_SIZE:
            return False
    except Exception as e:
        print(f"Error validating image {file_path}: {e}")
        return False
    return True


def generate_image_hash(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    return sha256.hexdigest()


def generate_thumbnail(
    file_path: Path, size: tuple[int, int] = THUMBNAIL_SIZE
) -> Optional[str]:
    try:
        with Image.open(file_path) as img:
            # Handle RAW and Transparency: Convert to RGB for JPEG compatibility
            if img.mode in ("RGBA", "P", "CMYK"):
                img = img.convert("RGB")

            size = size
            img.thumbnail(size)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG")
            thumb_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return thumb_b64
    except Exception as e:
        print(f"Thumbnail generation error for {file_path}: {e}")
        return None


def generate_thumbnail_from_bytes(
    img_data: bytes, size: tuple[int, int] = THUMBNAIL_SIZE
) -> Optional[str]:
    try:
        with Image.open(io.BytesIO(img_data)) as img:
            # Handle RAW and Transparency: Convert to RGB for JPEG compatibility
            if img.mode in ("RGBA", "P", "CMYK"):
                img = img.convert("RGB")

            size = size
            img.thumbnail(size)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG")
            thumb_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return thumb_b64
    except Exception as e:
        print(f"Thumbnail generation error from bytes: {e}")
        return None


def generate_base64_image(file_path: Path) -> Optional[str]:
    try:
        with open(file_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
            return img_b64
    except Exception as e:
        print(f"Base64 encoding error for {file_path}: {e}")
        return None


def get_valid_file_stats(file_path: Path) -> Optional[os.stat_result]:
    if not file_path.exists():
        return None
    if not file_path.is_file():
        return None
    try:
        stat = file_path.stat()
        return stat
    except OSError:
        return None


def extract_exif(img: Image.Image) -> dict:
    """
    Extracts EXIF data and converts non-serializable types
    (bytes, rationals) into standard Python types.
    """
    exif_data = {}
    try:
        # Get raw EXIF
        if isinstance(img, TiffImageFile):
            info = img.tag_v2
        elif hasattr(img, "_getexif"):
            info = img._getexif()
        else:
            info = None
        if not info:
            return {}

        for tag, value in info.items():
            decoded = ExifTags.TAGS.get(tag, tag)

            # Handle non-serializable types
            if isinstance(value, bytes):
                try:
                    value = value.decode("utf-8", "ignore").strip("\x00")
                except:
                    value = "<binary data>"

            # Convert Rational types (like exposure time) to floats or strings
            if hasattr(value, "numerator") and hasattr(value, "denominator"):
                if value.denominator != 0:
                    value = float(value)
                else:
                    value = str(value)

            # Recursive cleaning for nested dicts (common in some EXIF formats)
            if isinstance(value, dict):
                value = {str(k): str(v) for k, v in value.items()}

            exif_data[str(decoded)] = value

    except Exception as e:
        print(f"EXIF Extraction error: {e}")

    return exif_data
