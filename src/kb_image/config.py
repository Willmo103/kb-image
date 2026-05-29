import os
import ollama

IMAGE_FORMATS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".webp",
    ".nef",
    ".raw",
]
MIN_SIZE_HEIGHT = 400
MIN_SIZE_WIDTH = 400
MIN_FILE_SIZE = 10 * 1024  # 10 KB
THUMBNAIL_SIZE = (300, 300)

# Configure Ollama host from environment, falling back to network address if not set
ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11414")
Client = ollama.Client(host=ollama_host)

IMAGE_CLASSIFICATION_MODEL = "gemma4:latest"
IMAGE_DESCRIPTION_MODEL = "gemma4:latest"
