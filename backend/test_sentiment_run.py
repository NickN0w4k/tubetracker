import sys, json
sys.path.insert(0, '.')
from sentiment_service import get_analyzer

print('Initializing analyzer (may download model, this can take time)')
ana = get_analyzer()
examples = [
    "Tolles Video! 🔥",
    "Das ist der schlechteste Kanal überhaupt.",
    "Nice, learned a lot, danke!",
    "Meh.",
    "Worst tutorial ever.",
    "Top Inhalt, weiter so!",
    "Schrecklich, totale Zeitverschwendung.",
    "Ich weiß nicht, was ich davon halten soll.",
    "Super hilfreich, hat mir sehr geholfen.",
    "Lol 😂 this made my day"
]
print('Running batch analysis for sample comments...')
res = ana.analyze_batch(examples)
print(json.dumps({'examples': examples, 'results': res}, ensure_ascii=False, indent=2))
