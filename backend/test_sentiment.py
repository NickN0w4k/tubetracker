import json
from sentiment_service import get_analyzer

samples = [
    'Tolles Video, sehr informativ!',
    'Das ist der schlechteste Kanal ever.',
    '✨🔥 Genial!',
    'Nicht schlecht, könnte besser sein.',
    'Ich hasse das.',
    'Nice work!',
    'Meh.',
    'Warum wurde das hochgeladen? 🤦',
    'Top! 10/10',
    'Totally useless.'
]

an = get_analyzer()
res = an.analyze_batch(samples)
out = [{'text': t, 'result': r} for t, r in zip(samples, res)]
print(json.dumps(out, indent=2, ensure_ascii=False))
