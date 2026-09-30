"""Makes the home screen's card media from V6's originals (D9, R15).

Each module card gets a silent looping WebM (VP9), an MP4 (H.264) fallback and
a JPEG still. The About page gets its photo and card art. Output goes to
public/media/; the originals in original/assets/ are only read.

Needs Pillow and imageio-ffmpeg:  python3 -m pip install pillow imageio-ffmpeg
Run from the repo root:           python3 tools/make_card_media.py
"""
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "original" / "assets"
CARDS = ROOT / "public" / "media" / "cards"
MEDIA = ROOT / "public" / "media"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

WIDTH = 640  # cards show at about 300 to 600 px wide
FPS = 24

# Module id -> V6 card video. The KML and 3D cards merge into one debrief card (D16);
# the KML card's loop is kept.
CARD_VIDEOS = {
    "debrief": "31fd2712b6d2b1b9.mp4",
    "turn-sim": "549f23718284f579.mp4",
    "turn-fight": "bd5322c7591db661.mp4",
    "traffic": "f02b8241109c638c.mp4",
    "sof": "3d5fb643ce1948e7.mp4",
}

# Second of each loop used for the still shown before the video plays.
STILL_AT = {"debrief": 2, "turn-sim": 6, "turn-fight": 14, "traffic": 3, "sof": 2}

ABOUT_PHOTO = "dc38ec5166afd808.jpg"  # formation photo on V6's About page
ABOUT_CARD = "1084ad843be72b44.png"   # V6's About card art


def ffmpeg(*args):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", *args], check=True)


def make_card(module_id, source):
    src = str(ASSETS / source)
    scale = f"scale={WIDTH}:-2,fps={FPS}"
    ffmpeg("-i", src, "-an", "-vf", scale, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "42",
           "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", str(CARDS / f"{module_id}.webm"))
    ffmpeg("-i", src, "-an", "-vf", scale, "-c:v", "libx264", "-crf", "30", "-preset", "slow",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(CARDS / f"{module_id}.mp4"))
    ffmpeg("-ss", str(STILL_AT[module_id]), "-i", src, "-frames:v", "1", "-vf", f"scale={WIDTH}:-2", "-q:v", "5",
           str(CARDS / f"{module_id}.jpg"))


def make_jpeg(source, target, width):
    image = Image.open(ASSETS / source).convert("RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    image.save(target, "JPEG", quality=80, optimize=True, progressive=True)


def main():
    CARDS.mkdir(parents=True, exist_ok=True)
    for module_id, source in CARD_VIDEOS.items():
        make_card(module_id, source)
    make_jpeg(ABOUT_PHOTO, MEDIA / "about-photo.jpg", 1400)
    make_jpeg(ABOUT_CARD, CARDS / "about.jpg", WIDTH)
    for path in sorted(MEDIA.rglob("*.*")):
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size / 1000:.0f} kB")


if __name__ == "__main__":
    main()
