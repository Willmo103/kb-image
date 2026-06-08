# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.7] - 2026-06-08
### Added
- Quick Scan (Metadata-Only) Mode for `import` CLI command (`--quick` / `-q`), allowing fast metadata indexing without generating base64 original images and thumbnails.
- Support for optional `image` and `thumbnail` fields in the `BaseImage` pydantic database model.
- New `fill` subcommand to back-fill missing base64 image data and thumbnails from disk.
- Unit tests covering quick scan imports and the back-filling command.

## [0.1.6] - 2026-06-06
### Added
- System tray collapsing and double-click restore handlers to Electron app.
- Portable Electron binary download support inside `serve` and `install` commands when missing locally.
- Added `install` and `update` subcommands to CLI for system path integration and updates.
- Staged built desktop binary inside `build.py` prior to building python wheels.

## [0.1.5] - 2026-06-05
### Changed
- Standardized package.json files packaging configuration.

## [0.1.4] - 2026-06-03
### Changed
- Improved code readability in `build.py` through consistent whitespace adjustments.

## [0.1.3] - 2026-06-01
### Changed
- Added clean steps to `build.py` to purge previous dist artifacts.
### Added
- Electron desktop entry point and Python CLI structure with assets and documentation.

## [0.1.2] - 2026-05-30
### Changed
- Pinned sidebar navigation menu to make only main panel scrollable.

## [0.1.1] - 2026-05-29
### Changed
- Updated `.gitignore` to track `package-lock.json` and added lockfile to `desktop` directory.
### Added
- Automated CI/CD pipeline for testing, version bumping, and GitHub releases.

## [0.1.0] - 2026-05-29
### Added
- Initial project release with React-Electron application, SQLite catalog integration, and Ollama AI image processing capabilities (Describe/Tag/Classify handlers).
- Customizable AI settings panel for Ollama host and model configuration.
- Consolidated codebase from legacy web structures.
