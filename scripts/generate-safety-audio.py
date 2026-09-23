"""Generate fixed safety prompts once; the deployed app makes no TTS requests."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--tools-dir', type=Path)
parser.add_argument('--language', help='Generate one locale, e.g. pa-IN; omitted means all.')
args = parser.parse_args()
if args.tools_dir:
    sys.path.insert(0, str(args.tools_dir.resolve()))
from gtts import gTTS
from gtts.lang import tts_langs
from mutagen.mp3 import MP3

result = subprocess.run(['node', '--input-type=module', '-e',
    "import {SAFETY_LANGUAGES} from './frontend/src/lib/safetyAudio.js'; console.log(JSON.stringify(SAFETY_LANGUAGES));"],
    cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
languages = json.loads(result.stdout)
output = ROOT / 'frontend/public/audio/safety'
output.mkdir(parents=True, exist_ok=True)
manifest_path = ROOT / 'frontend/src/lib/safetyAudioManifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
# Test the missing voice first.
languages.sort(key=lambda language: language['code'] != 'pa-IN')
for language in languages:
    code = language['code']
    if args.language and code != args.language:
        continue
    short_code = code.split('-')[0]
    if short_code not in tts_langs():
        raise ValueError(f'No generation support for {code}')
    clips = {}
    for prompt in ['greeting', 'seatbelt']:
        text = language[prompt]
        digest = hashlib.sha256(text.encode('utf-8')).hexdigest()[:10]
        name = f'{code}-{prompt}-{digest}.mp3'
        target = output / name
        if not target.exists():
            temporary = target.with_suffix('.part')
            gTTS(text, lang=short_code, tld='co.in' if short_code == 'en' else 'com', timeout=(10, 45)).save(str(temporary))
            audio = MP3(temporary)
            if audio.info.length < 0.5:
                raise ValueError(f'Generated audio too short: {name}')
            temporary.replace(target)
        audio = MP3(target)
        clips[prompt] = {'url': '/audio/safety/' + name, 'text': text,
                         'duration_seconds': round(audio.info.length, 3), 'bytes': target.stat().st_size}
        print(f'{code} {prompt}: {audio.info.length:.1f}s, {target.stat().st_size} bytes', flush=True)
    manifest[code] = clips
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Audio manifest updated.', flush=True)
