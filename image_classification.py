from models import BaseImage, ImageClasses
from config import Client, IMAGE_CLASSIFICATION_MODEL
from ollama import *

_sys_prompt = """
# You are an image classification assistant.

## Goal

Given the image, classify that image into one of the following classes:

- `nature`
- `people`
- `screenshots`
- `diagrams`
- `nsfw`
- `memes`
- `other`

## Instructions

1. Analyze the image and determine which of the above classes it belongs to.
2. Respond with only the class name as a string, **without any additional text or explanation**.
3. If the image does not clearly fit into any of the above categories, classify it as `other`.

## Constraints

- Images must only be classified into one of the specified classes. Do not create new classes or use synonyms.
- Each image may only belong to one class. Do not assign multiple classes to a single image.
- Other is the `catch-all` class for images that do not fit into the other categories. Use it when the image is ambiguous or does not clearly belong to any of the other classes.
"""


def classify_image(image: BaseImage) -> str:
    response = Client.chat(
        model=IMAGE_CLASSIFICATION_MODEL,
        messages=[
            Message(
                role="system",
                content=_sys_prompt,
            ),
            Message(
                role="user",
                content="Classify the attached image.",
                images=[image.image],
            ),
        ],
        think=False,
    )
    classification = response.text.strip().lower()
    if classification not in ImageClasses.image_classes:
        classification = "other"
    return classification
