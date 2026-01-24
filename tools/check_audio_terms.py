#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


def normalize_term(text: str) -> str:
    return (
        text.strip()
        .replace("\u3000", " ")
        .replace("(", "")
        .replace(")", "")
    )


def load_terms(args: argparse.Namespace) -> list[str]:
    if args.terms_file:
        content = Path(args.terms_file).read_text(encoding="utf-8")
    elif args.terms:
        content = args.terms
    else:
        content = sys.stdin.read()
    return [normalize_term(line) for line in content.splitlines() if normalize_term(line)]


def build_manifest_from_disk(audio_root: Path) -> dict:
    manifest: dict[str, dict[str, str]] = {}
    for wav in audio_root.rglob("*.wav"):
        rel = wav.as_posix()
        parts = rel.split("/")
        if len(parts) < 3:
            continue
        voice_folder = parts[1]
        key = wav.stem.split("_")[-1].strip()
        manifest.setdefault(key, {})[voice_folder] = rel
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check whether audio terms exist in the manifest and on disk.",
    )
    parser.add_argument(
        "--terms",
        help="Newline-separated list of terms to check (can also be piped via stdin).",
    )
    parser.add_argument(
        "--terms-file",
        help="Path to a file containing one term per line.",
    )
    parser.add_argument(
        "--manifest",
        default="Audio/audio-manifest.json",
        help="Path to Audio/audio-manifest.json.",
    )
    parser.add_argument(
        "--audio-root",
        default="Audio",
        help="Root directory that contains voice folders.",
    )
    args = parser.parse_args()

    terms = load_terms(args)
    if not terms:
        print("No terms provided.")
        return 1

    manifest_path = Path(args.manifest)
    audio_root = Path(args.audio_root)
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {}

    disk_manifest = build_manifest_from_disk(audio_root) if audio_root.exists() else {}

    missing_manifest = []
    missing_disk = []
    for term in terms:
        if term not in manifest:
            missing_manifest.append(term)
        if term not in disk_manifest:
            missing_disk.append(term)

    print(f"Checked {len(terms)} term(s).")
    print(f"Missing from manifest: {len(missing_manifest)}")
    if missing_manifest:
        print("- " + "\n- ".join(missing_manifest))
    print(f"Missing from disk: {len(missing_disk)}")
    if missing_disk:
        print("- " + "\n- ".join(missing_disk))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
