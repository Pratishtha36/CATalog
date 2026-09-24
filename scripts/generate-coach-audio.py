"""Generate bundled fallback Hindi lesson/question audio from fixed reviewed text."""
import sys
import json
import hashlib
import shutil
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tmp/audio-tools'))
sys.path.insert(0, str(ROOT / 'backend'))
from coach import SCRIPTS, quiz_for
from gtts import gTTS
from mutagen.mp3 import MP3

output = ROOT / 'frontend/public/audio/coach'
output.mkdir(parents=True, exist_ok=True)
texts = {'utility-alert': 'सावधान। नमूना नक्शे में उपयोगिता पास है। साइट की अधिकृत सुरक्षा प्रक्रिया अपनाएँ। यह ऐप खुदाई की अनुमति नहीं देता।'}
for kind, (_, script) in SCRIPTS.items():
    texts[kind] = script
    for i, question in enumerate(quiz_for(kind)):
        texts[f'{kind}-quiz-{i}'] = question['question_hi'] + '। ' + '। '.join(f'{n + 1}। {option.split(" / ")[0]}' for n, option in enumerate(question['options']))
manifest = {}
generated = {}
for name, text in texts.items():
    target = output / f'{name}.mp3'
    digest = hashlib.sha256(text.encode()).hexdigest()
    if digest in generated:
        shutil.copyfile(generated[digest], target)
    else:
        try:
            valid = target.exists() and target.stat().st_size > 1000 and MP3(target).info.length > .5
        except Exception:
            valid = False
        if not valid or '--force' in sys.argv:
            temporary = target.with_suffix('.part')
            gTTS(text, lang='hi', timeout=(10, 45)).save(str(temporary))
            if MP3(temporary).info.length < .5: raise ValueError('Invalid generated audio')
            temporary.replace(target)
        generated[digest] = target
    audio = MP3(target)
    if audio.info.length < .5: raise ValueError('Invalid generated audio')
    manifest[name] = {'sha256_text': digest, 'bytes': target.stat().st_size, 'duration_seconds': round(audio.info.length, 2)}
    print(name, round(audio.info.length, 1), 'seconds', flush=True)
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
