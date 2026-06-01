"""
Entry point for the `kb-image` CLI, which is a component of the `kb` stack.
"""

from pathlib import Path
from typing import Optional

import typer
from kb_core.config import Config

from .process import (
    import_image_file,
    import_image_files_from_directory,
    import_web_image,
)

config = Config()
kb_image_cli = typer.Typer(
    help="CLI for `kb-image` - the image component of the `kb` stack."
)
_db = config.get_db()


@kb_image_cli.command("import")
def import_images(
    directory: Optional[str] = typer.Option(
        None,
        "-d",
        "--dir",
        help="Directory to import images from. If not provided,\
             imports a single image specified by --file.",
    ),
    file: Optional[str] = typer.Option(
        None,
        "-f",
        "--file",
        help="Path to a single image file to import. If not \
        provided, imports all images from the directory specified \
        by --dir.",
    ),
    url: Optional[str] = typer.Option(
        None,
        "-u",
        "--url",
        help="URL of a web image to import. If provided, imports \
        the image from the URL instead of local files.",
    ),
):
    """Import images into the knowledge base from a specified directory or a
    single file. Only one of --dir or --file should be provided. If both
    are provided, the CLI will prioritize --file and ignore --dir.
    """
    if url:
        return import_web_image(url, _db)
    elif file:
        return import_image_file(Path(file), _db)
    elif directory:
        return import_image_files_from_directory(Path(directory), _db)
    else:
        typer.echo(
            "Please provide either a directory with --dir or a single file with --file, "
            "or a URL with --url to import images."
        )


@kb_image_cli.command("serve")
def serve(
    dev: bool = typer.Option(
        False,
        "--dev",
        help="Run in development mode (pointing to localhost:3000 instead of built assets)",
    )
):
    """Launch the Electron desktop application to browse the image library."""
    import subprocess
    import sys
    import os

    desktop_dir = Path(__file__).resolve().parent.parent.parent / "desktop"
    typer.echo("Launching Electron application...")

    env = os.environ.copy()
    if dev:
        env["NODE_ENV"] = "development"
    else:
        env["NODE_ENV"] = "production"

    creationflags = 0
    if sys.platform == "win32":
        # DETACHED_PROCESS = 0x00000008, CREATE_NO_WINDOW = 0x08000000
        creationflags = 0x00000008 | 0x08000000

    try:
        subprocess.Popen(
            ["npm", "start"],
            cwd=desktop_dir,
            shell=sys.platform == "win32",
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
        )
    except Exception as e:
        typer.echo(f"Error launching Electron: {e}")


@kb_image_cli.command("tag")
def tag_images(
    limit: Optional[int] = typer.Option(
        None,
        "--limit",
        "-l",
        help="Maximum number of images to tag.",
    )
):
    """Generate tags for untagged images in the database using Ollama."""
    import json
    from .image_tagger import tag_image
    from .models import BaseImage

    db = config.get_db()
    tables = db.table_names()
    tagged_count = 0

    for table_name in ["image_files", "web_images"]:
        if table_name not in tables:
            continue
        try:
            # Query images where tags is null, empty string, or empty JSON array
            rows = list(
                db.query(
                    f"SELECT * FROM {table_name} "
                    f"WHERE tags IS NULL OR tags = '' OR tags = '[]'"
                )
            )
            for row in rows:
                if limit and tagged_count >= limit:
                    break

                try:
                    image = BaseImage(**row)
                    typer.echo(f"Tagging {image.file_name} ({image.image_hash[:8]})...")
                    tags = tag_image(image)
                    db[table_name].update(image.image_hash, {"tags": json.dumps(tags)})
                    typer.echo(f"  Tags: {', '.join(tags)}")
                    tagged_count += 1
                except Exception as ex:
                    typer.echo(
                        f"  Error tagging image {row.get('file_name', '')}: {ex}"
                    )
        except Exception as e:
            typer.echo(f"  Error querying table {table_name}: {e}")

    typer.echo(f"Finished tagging. Tagged {tagged_count} images.")


# Future --- IGNORE AND LEAVE ALONE FOR NOW ---
# TODO: Add a command to initialize and visualize image classification on images in the database
# TODO: Add a command to initialize and visualize image description processing on undescribed images in the database.
# TODO: Create a process to embed the classification and description for all images and create a vector database

if __name__ == "__main__":
    kb_image_cli()
