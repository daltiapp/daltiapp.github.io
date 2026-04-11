#!/usr/bin/env python3

import json
import sys
from pathlib import Path


def validate_json_file(file_path: Path) -> tuple[bool, str | None]:
    try:
        with file_path.open("r", encoding="utf-8-sig") as handle:
            json.load(handle)
        return True, None
    except json.JSONDecodeError as error:
        message = f"JSON 문법 오류 (line {error.lineno}, column {error.colno}): {error.msg}"
        return False, message
    except Exception as error:  # pragma: no cover
        return False, f"파일 읽기 오류: {error}"


def main() -> int:
    base_dir = Path(__file__).resolve().parent
    json_files = sorted(path for path in base_dir.rglob("*.json") if path.is_file())

    if not json_files:
        print(f"JSON 파일이 없습니다: {base_dir}")
        return 0

    invalid_files = []

    print(f"검사 대상 폴더: {base_dir}")
    print(f"검사 대상 JSON 파일 수: {len(json_files)}")
    print("")

    for json_file in json_files:
        is_valid, error_message = validate_json_file(json_file)
        relative_path = json_file.relative_to(base_dir)
        if is_valid:
            print(f"[OK] {relative_path}")
        else:
            print(f"[ERROR] {relative_path}")
            print(f"        {error_message}")
            invalid_files.append(relative_path)

    print("")
    if invalid_files:
        print(f"유효성 검사 실패: {len(invalid_files)}개 파일에 문제가 있습니다.")
        return 1

    print("모든 JSON 파일이 유효합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
