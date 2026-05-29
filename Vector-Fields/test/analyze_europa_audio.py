#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
AUDIO_PATH = ROOT / "Assets/Audio/europa-tecnosine-main-version-07-43-13869.mp3"
RECORDED_TIMELINE_TS = ROOT / "Assets/Scripts/EuropaTecnosineTimeline.ts"
OUT_TS = ROOT / "Assets/Scripts/EuropaTecnosineAudioAnalysis.ts"
OUT_AMBIENT_TS = ROOT / "Assets/Scripts/EuropaTecnosineAmbientChannels.ts"
OUT_DIR = ROOT / "test/audio_analysis"
OUT_SUMMARY = OUT_DIR / "europa_audio_analysis_summary.json"
OUT_AMBIENT_SUMMARY = OUT_DIR / "europa_ambient_channels_summary.json"
OUT_PLOT = OUT_DIR / "europa_audio_analysis_preview.svg"

TARGET_SR = 22050
ANALYSIS_RATE = 24
N_FFT = 8192
WIN_LENGTH = 8192
SUB_BASS_MIN = 22.0
SUB_BASS_MAX = 40.0
MID_MIN = 180.0
MID_MAX = 2200.0


def normalize_percentile(values: np.ndarray, lo: float = 5.0, hi: float = 95.0) -> np.ndarray:
    low = float(np.nanpercentile(values, lo))
    high = float(np.nanpercentile(values, hi))
    if high <= low:
        return np.zeros_like(values, dtype=np.float32)
    return np.clip((values - low) / (high - low), 0.0, 1.0).astype(np.float32)


def hz_to_unit(freq: np.ndarray, fmin: float, fmax: float) -> np.ndarray:
    safe = np.maximum(freq, 1e-6)
    value = (np.log2(safe) - math.log2(fmin)) / (math.log2(fmax) - math.log2(fmin))
    return np.clip(value, 0.0, 1.0).astype(np.float32)


def fill_invalid(values: np.ndarray, fallback: float = 0.5) -> np.ndarray:
    valid = np.isfinite(values)
    if not np.any(valid):
        return np.full_like(values, fallback, dtype=np.float32)
    x = np.arange(len(values))
    filled = np.interp(x, x[valid], values[valid])
    return filled.astype(np.float32)


def smooth_gaussian(values: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return values.astype(np.float32)
    radius = max(1, int(math.ceil(sigma * 4.0)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    kernel = np.exp(-(x * x) / (2.0 * sigma * sigma))
    kernel /= np.sum(kernel)
    padded = np.pad(values.astype(np.float32), radius, mode="edge")
    return np.convolve(padded, kernel, mode="valid").astype(np.float32)


def median_filter(values: np.ndarray, kernel_size: int) -> np.ndarray:
    if kernel_size <= 1:
        return values.astype(np.float32)
    if kernel_size % 2 == 0:
        kernel_size += 1
    radius = kernel_size // 2
    padded = np.pad(values.astype(np.float32), radius, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, kernel_size)
    return np.median(windows, axis=1).astype(np.float32)


def load_audio_ffmpeg(path: Path, sr: int) -> np.ndarray:
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(path),
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        str(sr),
        "-",
    ]
    pcm = subprocess.check_output(cmd)
    return np.frombuffer(pcm, dtype="<f4").copy()


def read_ts_constant(path: Path, name: str) -> float:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"export const {re.escape(name)} = ([0-9.]+);", text)
    if not match:
        raise ValueError(f"Could not find {name} in {path}")
    return float(match.group(1))


def read_ts_number_array(path: Path, name: str) -> np.ndarray:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"const {re.escape(name)}: number\[] = \[(.*?)\];", text, re.S)
    if not match:
        raise ValueError(f"Could not find {name} in {path}")
    values = np.fromstring(match.group(1).replace("\n", " "), sep=",", dtype=np.float32)
    if values.size == 0:
        raise ValueError(f"{name} in {path} did not contain parseable numbers")
    return values


def sample_recorded_channel(channel_index: int, times: np.ndarray) -> np.ndarray:
    duration = read_ts_constant(RECORDED_TIMELINE_TS, "EUROPA_TECNOSINE_DURATION")
    sample_rate = read_ts_constant(RECORDED_TIMELINE_TS, "EUROPA_TECNOSINE_SAMPLE_RATE")
    frame_count = int(read_ts_constant(RECORDED_TIMELINE_TS, "EUROPA_TECNOSINE_FRAME_COUNT"))
    values = read_ts_number_array(RECORDED_TIMELINE_TS, "EUROPA_TECNOSINE_VALUES")
    frames = values.reshape(frame_count, 4) * 0.01

    t = np.clip(times, 0.0, duration)
    position = t * sample_rate
    i0 = np.minimum(frame_count - 1, np.maximum(0, np.floor(position).astype(np.int64)))
    i1 = np.minimum(frame_count - 1, i0 + 1)
    u = (position - i0).astype(np.float32)
    a = frames[i0, channel_index]
    b = frames[i1, channel_index]
    return (a + (b - a) * u).astype(np.float32)


def analyze_bands(y: np.ndarray, sr: int, hop_length: int) -> dict[str, np.ndarray]:
    pad = N_FFT // 2
    padded = np.pad(y.astype(np.float32), pad, mode="reflect")
    frame_count = 1 + max(0, (len(padded) - N_FFT) // hop_length)
    starts = np.arange(frame_count, dtype=np.int64) * hop_length
    window = np.hanning(N_FFT).astype(np.float32)
    freqs = np.fft.rfftfreq(N_FFT, d=1.0 / sr).astype(np.float32)
    low_mask = (freqs >= SUB_BASS_MIN) & (freqs <= SUB_BASS_MAX)
    mid_mask = (freqs >= MID_MIN) & (freqs <= MID_MAX)
    mid_freqs = freqs[mid_mask]

    rms = np.zeros(frame_count, dtype=np.float32)
    low_energy = np.zeros(frame_count, dtype=np.float32)
    mid_energy = np.zeros(frame_count, dtype=np.float32)
    pad_hz = np.zeros(frame_count, dtype=np.float32)
    pad_peak_ratio = np.zeros(frame_count, dtype=np.float32)

    chunk_size = 256
    offsets = np.arange(N_FFT, dtype=np.int64)
    for start_frame in range(0, frame_count, chunk_size):
      end_frame = min(frame_count, start_frame + chunk_size)
      frame_starts = starts[start_frame:end_frame]
      frames = padded[frame_starts[:, None] + offsets[None, :]]
      rms[start_frame:end_frame] = np.sqrt(np.mean(frames * frames, axis=1))
      mag = np.abs(np.fft.rfft(frames * window[None, :], n=N_FFT, axis=1)).astype(np.float32)

      low = mag[:, low_mask]
      mid = mag[:, mid_mask]
      low_energy[start_frame:end_frame] = np.log1p(np.sqrt(np.mean(low * low, axis=1)))
      mid_energy[start_frame:end_frame] = np.log1p(np.sqrt(np.mean(mid * mid, axis=1)))

      mid_idx = np.argmax(mid, axis=1)
      mid_peak = mid[np.arange(end_frame - start_frame), mid_idx]
      pad_hz[start_frame:end_frame] = mid_freqs[mid_idx]
      pad_peak_ratio[start_frame:end_frame] = np.clip(mid_peak / np.maximum(np.sum(mid, axis=1), 1e-8) * 12.0, 0.0, 1.0)

    return {
        "freqs": freqs,
        "rms": rms,
        "lowEnergy": low_energy,
        "midEnergy": mid_energy,
        "padHz": pad_hz,
        "padPeakRatio": pad_peak_ratio,
    }


def make_ts(values: np.ndarray, duration: float, summary: dict) -> str:
    quantized = np.clip(np.round(values * 100.0), 0, 100).astype(np.int16)
    flat = quantized.reshape(-1)
    rows = []
    line = []
    for i, value in enumerate(flat):
        line.append(str(int(value)))
        if len(line) == 32:
            rows.append("  " + ", ".join(line) + ",")
            line = []
    if line:
        rows.append("  " + ", ".join(line) + ",")

    return f"""// AUTO-GENERATED by test/analyze_europa_audio.py.
// Source audio: Assets/Audio/europa-tecnosine-main-version-07-43-13869.mp3
// Duration: {duration:.3f} seconds; analysis sample rate: {ANALYSIS_RATE} Hz.
// Channel map: x=overall magnitude, y=mid/pad pitch estimate, z=22-40 Hz sub-bass intensity, w=sub-bass envelope.

export const EUROPA_TECNOSINE_AUDIO_DURATION = {duration:.6f};
export const EUROPA_TECNOSINE_AUDIO_SAMPLE_RATE = {ANALYSIS_RATE};
export const EUROPA_TECNOSINE_AUDIO_FRAME_COUNT = {len(values)};
export const EUROPA_TECNOSINE_AUDIO_ANALYSIS_SUMMARY = {json.dumps(summary, separators=(",", ":"))};

const CHANNEL_COUNT = 4;
const INV_VALUE_SCALE = 0.01;

const EUROPA_TECNOSINE_AUDIO_VALUES: number[] = [
{chr(10).join(rows)}
];

export function sampleEuropaTecnosineAudioAnalysis(timeSeconds: number): vec4 {{
    if (timeSeconds <= 0.0) {{
        return readEuropaTecnosineAudioFrame(0);
    }}
    if (timeSeconds >= EUROPA_TECNOSINE_AUDIO_DURATION) {{
        return readEuropaTecnosineAudioFrame(EUROPA_TECNOSINE_AUDIO_FRAME_COUNT - 1);
    }}

    const frame = timeSeconds * EUROPA_TECNOSINE_AUDIO_SAMPLE_RATE;
    const i0 = Math.floor(frame);
    const i1 = Math.min(EUROPA_TECNOSINE_AUDIO_FRAME_COUNT - 1, i0 + 1);
    const t = frame - i0;
    const a = readEuropaTecnosineAudioFrame(i0);
    const b = readEuropaTecnosineAudioFrame(i1);
    return new vec4(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t
    );
}}

function readEuropaTecnosineAudioFrame(frameIndex: number): vec4 {{
    const offset = frameIndex * CHANNEL_COUNT;
    return new vec4(
        EUROPA_TECNOSINE_AUDIO_VALUES[offset] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AUDIO_VALUES[offset + 1] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AUDIO_VALUES[offset + 2] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AUDIO_VALUES[offset + 3] * INV_VALUE_SCALE
    );
}}
"""


def make_ambient_ts(values: np.ndarray, duration: float, summary: dict) -> str:
    quantized = np.clip(np.round(values * 100.0), 0, 100).astype(np.int16)
    flat = quantized.reshape(-1)
    rows = []
    line = []
    for value in flat:
        line.append(str(int(value)))
        if len(line) == 32:
            rows.append("  " + ", ".join(line) + ",")
            line = []
    if line:
        rows.append("  " + ", ".join(line) + ",")

    return f"""// AUTO-GENERATED by test/analyze_europa_audio.py.
// Final baked playback channels for the ambient vector intro.
// Sources: audio analysis + Assets/Scripts/EuropaTecnosineTimeline.ts
// Duration: {duration:.3f} seconds; sample rate: {ANALYSIS_RATE} Hz.
// Channel map: x=magnitude/opacity driver, y=recorded channel 2 yaw, z=22-40 Hz sub-bass intensity, w=opacity driver.

export const EUROPA_TECNOSINE_AMBIENT_DURATION = {duration:.6f};
export const EUROPA_TECNOSINE_AMBIENT_SAMPLE_RATE = {ANALYSIS_RATE};
export const EUROPA_TECNOSINE_AMBIENT_FRAME_COUNT = {len(values)};
export const EUROPA_TECNOSINE_AMBIENT_SUMMARY = {json.dumps(summary, separators=(",", ":"))};

const CHANNEL_COUNT = 4;
const INV_VALUE_SCALE = 0.01;

const EUROPA_TECNOSINE_AMBIENT_VALUES: number[] = [
{chr(10).join(rows)}
];

export function sampleEuropaTecnosineAmbientChannels(timeSeconds: number): vec4 {{
    if (timeSeconds <= 0.0) {{
        return readEuropaTecnosineAmbientFrame(0);
    }}
    if (timeSeconds >= EUROPA_TECNOSINE_AMBIENT_DURATION) {{
        return readEuropaTecnosineAmbientFrame(EUROPA_TECNOSINE_AMBIENT_FRAME_COUNT - 1);
    }}

    const frame = timeSeconds * EUROPA_TECNOSINE_AMBIENT_SAMPLE_RATE;
    const i0 = Math.floor(frame);
    const i1 = Math.min(EUROPA_TECNOSINE_AMBIENT_FRAME_COUNT - 1, i0 + 1);
    const t = frame - i0;
    const a = readEuropaTecnosineAmbientFrame(i0);
    const b = readEuropaTecnosineAmbientFrame(i1);
    return new vec4(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        a.z + (b.z - a.z) * t,
        a.w + (b.w - a.w) * t
    );
}}

function readEuropaTecnosineAmbientFrame(frameIndex: number): vec4 {{
    const offset = frameIndex * CHANNEL_COUNT;
    return new vec4(
        EUROPA_TECNOSINE_AMBIENT_VALUES[offset] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AMBIENT_VALUES[offset + 1] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AMBIENT_VALUES[offset + 2] * INV_VALUE_SCALE,
        EUROPA_TECNOSINE_AMBIENT_VALUES[offset + 3] * INV_VALUE_SCALE
    );
}}
"""


def svg_polyline(values: np.ndarray, x0: float, y0: float, width: float, height: float) -> str:
    safe = np.nan_to_num(values, nan=0.0, posinf=1.0, neginf=0.0)
    if len(safe) <= 1:
        return ""
    step = max(1, len(safe) // 1200)
    sampled = safe[::step]
    n = len(sampled)
    points = []
    for i, value in enumerate(sampled):
        x = x0 + (i / max(1, n - 1)) * width
        y = y0 + (1.0 - float(np.clip(value, 0.0, 1.0))) * height
        points.append(f"{x:.2f},{y:.2f}")
    return " ".join(points)


def write_svg_preview(
    path: Path,
    duration: float,
    channel_1: np.ndarray,
    channel_2: np.ndarray,
    channel_3: np.ndarray,
    channel_4: np.ndarray,
    pad_hz: np.ndarray,
) -> None:
    width = 1400
    row_h = 130
    left = 120
    right = 40
    top = 64
    gap = 20
    plot_w = width - left - right
    labels = [
        ("ch1 magnitude", channel_1),
        ("pad Hz 180-2200", hz_to_unit(pad_hz, MID_MIN, MID_MAX)),
        ("ch2 pad pitch estimate", channel_2),
        ("ch3 sub-bass 22-40 intensity / ch4 envelope", channel_3),
    ]
    height = top + len(labels) * row_h + (len(labels) - 1) * gap + 50
    rows = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f7f3ee"/>',
        '<text x="40" y="34" font-family="Inter,Arial,sans-serif" font-size="22" font-weight="700" fill="#191817">Europa Tecnosine Audio-Derived Channels</text>',
        f'<text x="{width - 40}" y="34" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="13" fill="#68635d">duration {duration:.2f}s</text>',
    ]
    for idx, (label, values) in enumerate(labels):
        y = top + idx * (row_h + gap)
        rows.append(f'<text x="40" y="{y + row_h * 0.5:.1f}" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#68635d">{label}</text>')
        rows.append(f'<rect x="{left}" y="{y}" width="{plot_w}" height="{row_h}" fill="#ede9e2" stroke="#c8c0b8" stroke-width="1"/>')
        for q in (0.25, 0.5, 0.75):
            gy = y + q * row_h
            rows.append(f'<line x1="{left}" y1="{gy:.2f}" x2="{left + plot_w}" y2="{gy:.2f}" stroke="#d7d0c8" stroke-width="1"/>')
        points = svg_polyline(values, left, y, plot_w, row_h)
        rows.append(f'<polyline points="{points}" fill="none" stroke="#191817" stroke-width="1.5"/>')
        if idx == 3:
            conf = svg_polyline(channel_4, left, y, plot_w, row_h)
            rows.append(f'<polyline points="{conf}" fill="none" stroke="#8b8580" stroke-width="1.1" opacity="0.75"/>')
    rows.append("</svg>")
    path.write_text("\n".join(rows), encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    y = load_audio_ffmpeg(AUDIO_PATH, TARGET_SR)
    sr = TARGET_SR
    duration = len(y) / sr
    hop_length = max(1, round(sr / ANALYSIS_RATE))
    actual_rate = sr / hop_length
    analysis = analyze_bands(y, sr, hop_length)
    rms = analysis["rms"]
    full_energy = smooth_gaussian(normalize_percentile(np.log1p(rms * 60.0), 8, 96), sigma=3)
    low_energy_raw = analysis["lowEnergy"]
    mid_energy_raw = analysis["midEnergy"]
    sub_bass_intensity = smooth_gaussian(normalize_percentile(low_energy_raw, 20, 98), sigma=3)
    low_conf = smooth_gaussian(normalize_percentile(low_energy_raw, 20, 98), sigma=4)
    mid_conf = smooth_gaussian(normalize_percentile(mid_energy_raw, 10, 95), sigma=4)

    pad_hz = analysis["padHz"].copy()
    pad_peak = analysis["padPeakRatio"]
    pad_hz[(mid_conf <= 0.12) | (pad_peak <= 0.08)] = np.nan
    pad_hz = fill_invalid(pad_hz)

    pad_unit = hz_to_unit(pad_hz, MID_MIN, MID_MAX)
    pad_unit = smooth_gaussian(median_filter(pad_unit, 9), sigma=4)

    channel_1 = np.clip(full_energy, 0.0, 1.0)
    channel_2 = np.clip(0.5 * (1.0 - mid_conf) + pad_unit * mid_conf, 0.0, 1.0)
    channel_3 = np.clip(sub_bass_intensity, 0.0, 1.0)
    channel_4 = np.clip(low_conf, 0.0, 1.0)
    values = np.stack([channel_1, channel_2, channel_3, channel_4], axis=1).astype(np.float32)
    times = np.arange(values.shape[0], dtype=np.float32) / ANALYSIS_RATE
    recorded_yaw = sample_recorded_channel(1, times)
    ambient_values = np.stack([channel_1, recorded_yaw, channel_3, channel_1], axis=1).astype(np.float32)

    summary = {
        "source": str(AUDIO_PATH.relative_to(ROOT)),
        "duration": duration,
        "targetSampleRate": ANALYSIS_RATE,
        "actualSampleRate": actual_rate,
        "frameCount": int(values.shape[0]),
        "bandsHz": {
            "subBass": [SUB_BASS_MIN, SUB_BASS_MAX],
            "pads": [MID_MIN, MID_MAX],
        },
        "channels": {
            "x": "overall full-band magnitude",
            "y": "mid/pad dominant pitch estimate, retained for diagnostics",
            "z": "22-40 Hz sub-bass band intensity",
            "w": "22-40 Hz sub-bass envelope",
        },
        "padHz": {
            "median": float(np.median(pad_hz)),
            "p10": float(np.percentile(pad_hz, 10)),
            "p90": float(np.percentile(pad_hz, 90)),
        },
        "subBassIntensity": {
            "mean": float(np.mean(channel_3)),
            "p10": float(np.percentile(channel_3, 10)),
            "p90": float(np.percentile(channel_3, 90)),
        },
        "confidence": {
            "subBassMean": float(np.mean(low_conf)),
            "padsMean": float(np.mean(mid_conf)),
            "padPeakRatioMean": float(np.mean(pad_peak)),
        },
    }
    ambient_summary = {
        "source": {
            "audio": str(AUDIO_PATH.relative_to(ROOT)),
            "recordedTimeline": str(RECORDED_TIMELINE_TS.relative_to(ROOT)),
        },
        "duration": duration,
        "targetSampleRate": ANALYSIS_RATE,
        "actualSampleRate": actual_rate,
        "frameCount": int(ambient_values.shape[0]),
        "bandsHz": {
            "subBass": [SUB_BASS_MIN, SUB_BASS_MAX],
        },
        "channels": {
            "x": "baked audio full-band magnitude, also the opacity driver",
            "y": "baked recorded channel 2 yaw from the slider timeline",
            "z": "baked 22-40 Hz sub-bass band intensity",
            "w": "baked opacity driver, duplicated from x for LS shader consumers",
        },
        "recordedYaw": {
            "mean": float(np.mean(recorded_yaw)),
            "p10": float(np.percentile(recorded_yaw, 10)),
            "p90": float(np.percentile(recorded_yaw, 90)),
        },
        "magnitude": {
            "mean": float(np.mean(channel_1)),
            "p10": float(np.percentile(channel_1, 10)),
            "p90": float(np.percentile(channel_1, 90)),
        },
        "subBassIntensity": {
            "mean": float(np.mean(channel_3)),
            "p10": float(np.percentile(channel_3, 10)),
            "p90": float(np.percentile(channel_3, 90)),
        },
    }

    OUT_TS.write_text(make_ts(values, duration, summary), encoding="utf-8")
    OUT_AMBIENT_TS.write_text(make_ambient_ts(ambient_values, duration, ambient_summary), encoding="utf-8")
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    OUT_AMBIENT_SUMMARY.write_text(json.dumps(ambient_summary, indent=2), encoding="utf-8")

    write_svg_preview(OUT_PLOT, duration, channel_1, channel_2, channel_3, channel_4, pad_hz)

    print(json.dumps(summary, indent=2))
    print(f"Wrote {OUT_TS.relative_to(ROOT)}")
    print(f"Wrote {OUT_AMBIENT_TS.relative_to(ROOT)}")
    print(f"Wrote {OUT_SUMMARY.relative_to(ROOT)}")
    print(f"Wrote {OUT_AMBIENT_SUMMARY.relative_to(ROOT)}")
    print(f"Wrote {OUT_PLOT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
