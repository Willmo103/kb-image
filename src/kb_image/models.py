"""
models.py
Contains Pydantic models for image data.
"""

import json
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class ImageClasses(str):
    """
    Enum for image classes.
    """

    NATURE = "nature"
    PEOPLE = "people"
    SCREENSHOTS = "screenshots"
    DIAGRAMS = "diagrams"
    NSFW = "nsfw"
    MEMES = "memes"
    OTHER = "other"

    image_classes = [
        NATURE,
        PEOPLE,
        SCREENSHOTS,
        DIAGRAMS,
        NSFW,
        MEMES,
        OTHER,
    ]


class BaseImage(BaseModel):
    """
    Base model for image data.
    """

    file_name: str
    extension: str
    size: int
    created: str
    modified: str
    hight: int
    width: int
    exif_data: dict
    thumbnail: Optional[str] = None  # Base64-encoded thumbnail image data
    image: Optional[str] = None  # Base64-encoded original image data
    image_hash: str  # Hash of the image content for deduplication
    description: Optional[str] = (
        None  # Optional description or metadata about the image
    )
    tags: Optional[list[str]] = None  # Optional list of tags or labels for the image
    classification: Optional[str] = None  # Optional classification label for the image

    @field_validator("tags", mode="before")
    def validate_tags(cls, v):
        """
        Validate tags.
        """
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                raise ValueError(
                    "Tags must be a valid JSON string representing a list of tags."
                )
        return v

    @field_validator("exif_data", mode="before")
    def validate_exif_data(cls, v):
        """
        Validate exif data.
        """
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                raise ValueError(
                    "EXIF data must be a valid JSON string representing a dictionary."
                )
        return v

    @model_validator(mode="before")
    def validate_classification(cls, values):
        """
        Validate classification.
        """
        classification = values.get("classification")
        if classification and classification not in ImageClasses.image_classes:
            raise ValueError(
                f"Classification must be one of: {', '.join(ImageClasses.image_classes)}"
            )
        return values

    @property
    def md_image(self) -> str:
        """
        Markdown image.
        """
        if not self.image:
            return f"[{self.file_name}](no-image)"
        return f"[{self.file_name}](data:image/{self.extension};base64,{self.image})"

    @property
    def md_thumbnail(self) -> str:
        """
        Markdown thumbnail.
        """
        if not self.thumbnail:
            return f"[{self.file_name}](no-thumbnail)"
        return f"[{self.file_name}](data:image/jpeg;base64,{self.thumbnail})"

    @property
    def storage_filename(self) -> str:
        """
        Storage filename.
        """
        return f"{self.image_hash}.{self.extension}"

    def __eq__(self, other):
        """
        Check if two BaseImages are equal.
        """
        if not isinstance(other, BaseImage):
            return NotImplemented
        return self.image_hash == other.image_hash


class ImageFile(BaseImage):
    """
    Image file model.
    """

    path: str

    @property
    def Path(self) -> str:
        """
        Path of the image file.
        """
        return self.path


class WebImage(BaseImage):
    """
    Web image model.
    """

    url: str
