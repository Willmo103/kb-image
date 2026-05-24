import typer
from sqlite_utils import Database
from pathlib import Path
from typing import Optional

from process import (
    import_image_files_from_directory,
    import_image_file,
    import_web_image,
)

_db_path = Path().home() / ".kb" / "kb.db"
_db_path.parent.mkdir(parents=True, exist_ok=True)

kb_image_cli = typer.Typer(
    help="CLI for `kb-image` - the image component of the `kb` stack."
)
_db = Database(_db_path)


@kb_image_cli.command("import")
def import_images(
    directory: Optional[str] = typer.Option(
        None,
        "-d",
        "--dir",
        help="Directory to import images from. If not provided, imports a single image specified by --file.",
    ),
    file: Optional[str] = typer.Option(
        None,
        "-f",
        "--file",
        help="Path to a single image file to import. If not provided, imports all images from the directory specified by --dir.",
    ),
    url: Optional[str] = typer.Option(
        None,
        "-u",
        "--url",
        help="URL of a web image to import. If provided, imports the image from the URL instead of local files.",
    ),
):
    """Import images into the knowledge base from a specified directory or a single file.
    Only one of --dir or --file should be provided. If both are provided, the CLI will prioritize --file and ignore --dir.
    """
    if url:
        return import_web_image(url, _db)
    elif file:
        return import_image_file(Path(file), _db)
    elif directory:
        return import_image_files_from_directory(Path(directory), _db)
    else:
        print(
            "Please provide either a directory with --dir or a single file with --file, "
            "or a URL with --url to import images."
        )


if __name__ == "__main__":
    kb_image_cli()
