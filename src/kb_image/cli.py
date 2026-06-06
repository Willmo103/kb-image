"""
Entry point for the `kb-image` CLI, which is a component of the `kb` stack.
"""

from pathlib import Path
from typing import Optional

import typer
from kb_core.config import Config
from kb_core.utils import download_github_release_asset, check_github_latest_release

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
    import shutil

    package_dir = Path(__file__).resolve().parent
    src_desktop_dir = package_dir.parent.parent / "desktop"

    if src_desktop_dir.exists() and (src_desktop_dir / "package.json").exists():
        # Development / Source checkout mode
        typer.echo("Launching Electron application in development source mode...")
        env = os.environ.copy()
        if dev:
            env["NODE_ENV"] = "development"
        else:
            env["NODE_ENV"] = "production"

        creationflags = 0
        if sys.platform == "win32":
            creationflags = 0x00000008 | 0x08000000

        try:
            subprocess.Popen(
                ["npm", "start"],
                cwd=src_desktop_dir,
                shell=sys.platform == "win32",
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
                close_fds=True,
            )
            return
        except Exception as e:
            typer.echo(f"Error launching Electron via npm start: {e}")
            raise typer.Exit(code=1)

    # Installed / Packaged mode
    # First check if the desktop app is in PATH under the distinct name "kb-image-desktop"
    exe_name = "kb-image-desktop"
    if sys.platform == "win32":
        exe_name += ".exe"

    path_exe = shutil.which(exe_name)
    target_exe = None

    if path_exe:
        target_exe = Path(path_exe)
    else:
        # Check standard installation locations or packaged desktop_dist folder
        base_name = "kb-image.exe" if sys.platform == "win32" else "kb-image"
        bundled_candidate = package_dir / "desktop_dist" / base_name
        
        # User app data local program files location (NSIS)
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        install_candidate = None
        if sys.platform == "win32" and local_app_data:
            install_candidate = Path(local_app_data) / "Programs" / "kb-image" / "kb-image.exe"

        if bundled_candidate.exists():
            target_exe = bundled_candidate
        elif install_candidate and install_candidate.exists():
            target_exe = install_candidate

    if not target_exe:
        typer.echo("Could not find built Electron application executable (kb-image-desktop).")
        typer.echo("Attempting to download prebuilt desktop binary from the latest GitHub release...")
        bin_dir = Path.home() / ".kb" / "bin"
        dest_name = "kb-image-desktop.exe" if sys.platform == "win32" else "kb-image-desktop"
        dest_exe = bin_dir / dest_name
        asset_pattern = r"kb-image.*\.exe" if sys.platform == "win32" else r"kb-image.*"
        success = download_github_release_asset(
            repo="Willmo103/kb-image",
            asset_pattern=asset_pattern,
            dest_path=dest_exe
        )
        if success:
            target_exe = dest_exe
            typer.echo(f"Successfully downloaded latest desktop binary to: {target_exe}")
        else:
            typer.echo("Error: Could not download prebuilt desktop binary from GitHub Releases.")
            typer.echo("Please run 'kb-image install' first to install the desktop assets.")
            raise typer.Exit(code=1)

    typer.echo(f"Launching Electron application: {target_exe}")
    creationflags = 0
    if sys.platform == "win32":
        creationflags = 0x00000008 | 0x08000000

    env = os.environ.copy()
    env["NODE_ENV"] = "production"

    try:
        subprocess.Popen(
            [str(target_exe)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
            close_fds=True,
            env=env
        )
    except Exception as e:
        typer.echo(f"Error executing Electron binary: {e}")
        raise typer.Exit(code=1)


@kb_image_cli.command("install")
def install():
    """
    Perform unified installation of the application:
    1. Initialize/Verify the database.
    2. Stage the desktop app binary in the local binary directory.
    3. Add the local binary directory to the user's system PATH.
    4. Create a desktop shortcut.
    """
    import shutil
    import subprocess
    import sys

    # 1. Verify DB path
    db_path = config.get_db()
    typer.echo(f"Database verified.")

    # 2. Setup standard binary path ~/.kb/bin
    bin_dir = Path.home() / ".kb" / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)

    # 3. Locate and copy packaged portable executable
    package_dir = Path(__file__).resolve().parent
    base_name = "kb-image.exe" if sys.platform == "win32" else "kb-image"
    bundled_exe = package_dir / "desktop_dist" / base_name
    dest_name = "kb-image-desktop.exe" if sys.platform == "win32" else "kb-image-desktop"
    dest_exe = bin_dir / dest_name

    if bundled_exe.exists():
        try:
            shutil.copy2(bundled_exe, dest_exe)
            typer.echo(f"Installed Electron desktop binary to: {dest_exe}")
        except Exception as e:
            typer.echo(f"Failed to copy Electron binary to bin: {e}")
    else:
        typer.echo("No bundled Electron application binary found to install.")
        typer.echo("Downloading the prebuilt desktop binary from the latest GitHub release...")
        asset_pattern = r"kb-image.*\.exe" if sys.platform == "win32" else r"kb-image.*"
        success = download_github_release_asset(
            repo="Willmo103/kb-image",
            asset_pattern=asset_pattern,
            dest_path=dest_exe
        )
        if success:
            typer.echo(f"Successfully downloaded and installed latest desktop binary to: {dest_exe}")
        else:
            typer.echo("Warning: Failed to download prebuilt desktop binary from GitHub Releases.")

    # 4. Add bin directory to PATH
    if sys.platform == "win32":
        import winreg
        import ctypes
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_ALL_ACCESS)
            path_val, _ = winreg.QueryValueEx(key, "Path")
            paths = [p.strip() for p in path_val.split(";")]
            bin_path_str = str(bin_dir)
            if bin_path_str not in paths:
                paths.append(bin_path_str)
                new_path_val = ";".join(paths)
                winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path_val)
                HWND_BROADCAST = 0xFFFF
                WM_SETTINGCHANGE = 0x001A
                ctypes.windll.user32.SendMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment")
                typer.echo(f"Added {bin_dir} to User PATH.")
            else:
                typer.echo(f"{bin_dir} is already in PATH.")
        except Exception as e:
            typer.echo(f"Failed to modify Windows PATH registry: {e}")
    else:
        bin_path_str = str(bin_dir)
        for rc in [".bashrc", ".zshrc", ".profile"]:
            rc_path = Path.home() / rc
            if rc_path.exists():
                try:
                    content = rc_path.read_text(errors="ignore")
                    export_line = f'export PATH="$PATH:{bin_path_str}"'
                    if export_line not in content:
                        with open(rc_path, "a") as f:
                            f.write(f"\n{export_line}\n")
                        typer.echo(f"Added PATH export to {rc}")
                except Exception as e:
                    typer.echo(f"Failed to write to {rc}: {e}")

    # 5. Create desktop shortcut
    if sys.platform == "win32" and dest_exe.exists():
        desktop = Path.home() / "Desktop"
        shortcut_path = desktop / "kb-image.lnk"
        ps_cmd = f"""
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut('{shortcut_path}')
        $Shortcut.TargetPath = '{dest_exe}'
        $Shortcut.WorkingDirectory = '{bin_dir}'
        $Shortcut.IconLocation = '{dest_exe},0'
        $Shortcut.Save()
        """
        try:
            subprocess.run(["powershell", "-Command", ps_cmd], check=True, capture_output=True)
            typer.echo(f"Created desktop shortcut: {shortcut_path}")
        except Exception as e:
            typer.echo(f"Failed to create desktop shortcut: {e}")
    elif sys.platform != "win32" and dest_exe.exists():
        desktop = Path.home() / "Desktop"
        shortcut_path = desktop / "kb-image.desktop"
        content = f"""[Desktop Entry]
Name=kb-image
Exec={dest_exe}
Type=Application
Terminal=false
"""
        try:
            shortcut_path.write_text(content)
            shortcut_path.chmod(0o755)
            typer.echo(f"Created desktop shortcut: {shortcut_path}")
        except Exception as e:
            typer.echo(f"Failed to create desktop shortcut: {e}")


@kb_image_cli.command("update")
def update():
    """
    Check the latest GitHub Release and download the updated desktop application if available.
    """
    typer.echo("Checking for updates on GitHub release channel...")
    release = check_github_latest_release("Willmo103/kb-image")
    if not release:
        typer.echo("Could not check latest release on GitHub.")
        raise typer.Exit(code=1)

    tag_name = release.get("tag_name", "unknown")
    typer.echo(f"Latest release version: {tag_name}")

    import importlib.metadata
    try:
        current_version = "v" + importlib.metadata.version("kb-image")
    except Exception:
        current_version = "v0.1.6"

    typer.echo(f"Current local package version: {current_version}")

    bin_dir = Path.home() / ".kb" / "bin"
    dest_name = "kb-image-desktop.exe" if sys.platform == "win32" else "kb-image-desktop"
    dest_exe = bin_dir / dest_name

    typer.echo(f"Downloading prebuilt desktop binary {tag_name}...")
    asset_pattern = r"kb-image.*\.exe" if sys.platform == "win32" else r"kb-image.*"
    success = download_github_release_asset(
        repo="Willmo103/kb-image",
        asset_pattern=asset_pattern,
        dest_path=dest_exe
    )
    if success:
        typer.echo(f"Successfully updated desktop binary to: {dest_exe}")
    else:
        typer.echo("Failed to update desktop binary.")


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
