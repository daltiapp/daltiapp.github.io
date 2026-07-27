#!/usr/bin/python3
import os
import subprocess
import sys
import traceback


def main() -> int:
    if len(sys.argv) != 6:
        print("spawn_server.py requires node, server, cwd, log, and port", file=sys.stderr)
        return 2

    node_bin, server_path, working_dir, log_path, port = sys.argv[1:]
    environment = os.environ.copy()
    environment["DALTI_DATA_STUDIO_PORT"] = port

    try:
        log_file = open(log_path, "ab", buffering=0)
        process = subprocess.Popen(
            [node_bin, server_path],
            cwd=working_dir,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            close_fds=True,
            start_new_session=True,
            env=environment,
        )
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return 1

    print(process.pid, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
