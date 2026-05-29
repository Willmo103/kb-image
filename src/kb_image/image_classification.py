"""
Description: This module is used to classify images using Ollama.

Dependencies:
- httpx
- sqlite-utils
- ollama
"""

from ollama import Message

from .config import IMAGE_CLASSIFICATION_MODEL, Client
from .models import BaseImage, ImageClasses

_SYS_PROMPT = """
# You are an image classification assistant.

## Goal
Classify the given image into one of the following classes:
- nature: landscapes, plants, animals, outdoors, weather, etc.
- people: portraits, groups of people, selfies, etc.
- screenshots: desktop or phone screenshots, code snippets, application windows, etc.
- diagrams: charts, graphs, flowcharts, technical drawings, etc.
- nsfw: explicit content, nudity, violence, etc.
- memes: funny images, internet jokes, text overlay images, etc.
- other: anything that does not fit into the other categories.

## Output Format
Your response MUST be exactly one of the classes listed above, and nothing else.
Do not include any explanation or extra text.
"""


def classify_image(image: BaseImage) -> str:
    """
    Classify an image using Ollama.

    Args:
        image: Image to classify

    Returns:
        Classification of the image
    """
    response = Client.chat(
        model=IMAGE_CLASSIFICATION_MODEL,
        messages=[
            Message(
                role="system",
                content=_SYS_PROMPT,
            ),
            Message(
                role="user",
                content="Classify the attached image.",
                images=[image.image],
            ),
        ],
        think=False,
    )
    classification = (
        response.message.content.strip().lower()  # pylint: disable=no-member
    )
    if classification not in ImageClasses.image_classes:
        classification = "other"
    return classification
