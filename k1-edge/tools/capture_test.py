#!/usr/bin/env python3
"""Probe camera configs and save camera_test.jpg.

Tries each camera config json (raw first, then use_v4l=1) until one produces
frames, then writes the working config to cam_config.json for go.sh.
"""
import json
import os
import sys
import cv2

CAND_JSONS = [
    "/usr/share/camera_json/csi3_camera_auto.json",
    "/usr/share/camera_json/csi1_camera_auto.json",
    "/usr/share/camera_json/csi2_camera_auto.json",
    "/root/svivi_cam1.json",
    "/tmp/csi3_camera_auto.json",
    "/tmp/csi1_camera_auto.json",
]


def variants():
    out = []
    for src in [j for j in CAND_JSONS if os.path.isfile(j)]:
        try:
            base = json.load(open(src))
        except Exception as e:
            print("... skip %s (bad json: %s)" % (src, e))
            continue
        for tag, mod in (("raw", None), ("use_v4l=1", 1)):
            d = dict(base)
            if mod is not None:
                d["use_v4l"] = mod
            if tag == "raw" and d.get("use_v4l") == 1:
                continue  # raw already equals use_v4l=1
            out.append((src, tag, d))
    return out


def try_open(json_path, frames):
    pipe = ("spacemitsrc location=%s close-dmabuf=1 ! "
            "video/x-raw,format=NV12,width=1920,height=1080 ! "
            "videoconvert ! video/x-raw,format=BGR ! "
            "appsink drop=true max-buffers=1 sync=false") % json_path
    cap = cv2.VideoCapture(pipe, cv2.CAP_GSTREAMER)
    if not cap.isOpened():
        cap.release()
        return None
    ok, last = False, None
    for _ in range(frames):
        ok, last = cap.read()
    cap.release()
    return last if ok and last is not None else None


def main():
    quiet = "--quiet" in sys.argv
    probe_frames = 6 if quiet else 10
    for src, tag, d in variants():
        tmp = "cam_config_probe.json"
        json.dump(d, open(tmp, "w"), indent=2)
        frame = try_open(tmp, probe_frames)
        if frame is not None:
            os.replace(tmp, "cam_config.json")
            print("OK   config=%s  (%s)" % (src, tag))
            if not quiet:
                cv2.imwrite("camera_test.jpg", frame)
                print("Captured OK:", frame.shape, "-> camera_test.jpg")
            return 0
        print("... %s (%s) -> no frames" % (src, tag))
        if os.path.isfile(tmp):
            os.remove(tmp)
    print("FAIL: no working camera config for this user.")
    print("Next:  sudo python3 tools/capture_test.py")
    print("If sudo works, it is a device permission issue (ion/dma_heap).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
