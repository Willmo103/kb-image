"""
Description: This module is used to generate tags for images using Ollama.
"""

from ollama import Message

from .config import IMAGE_DESCRIPTION_MODEL, Client
from .models import BaseImage

_SYS_PROMPT = """
# You are an image tagging assistant.

## Goal
Generate a list of 5-10 descriptive tags, keywords, or labels for the given image. 
Respond ONLY with a comma-separated list of tags, e.g., "mountain, landscape, sunset, snow". 
Do not include explanations, markdown formatting, or extra text.
"""


def tag_image(image: BaseImage) -> list[str]:
    """
    Generate tags for an image using Ollama.

    Args:
        image: Image to tag

    Returns:
        List of generated tags as strings
    """
    response = Client.chat(
        model=IMAGE_DESCRIPTION_MODEL,
        messages=[
            Message(role="system", content=_SYS_PROMPT),
            Message(role="user", content="Tag this image.", images=[image.image]),
        ],
        think=False,
    )
    content = response.message.content.strip()
    # Parse comma separated tags
    tags = [t.strip().lower() for t in content.split(",") if t.strip()]
    return tags
