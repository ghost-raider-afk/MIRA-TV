from pathlib import Path

p = Path('src/web/admin-ui/public/js/pages/screens.js')
text = p.read_text(encoding='utf-8')
old_card = """    } else {\n      currentFace.className = `screen-tv-face is-${status.key}`;\n    }\n"""
new_card = """    } else {\n      currentFace.classList.remove('is-unbound', 'is-online', 'is-offline');\n      currentFace.classList.add(`is-${status.key}`);\n    }\n"""
old_dialog = """  } else if (currentFace) {\n    currentFace.className = `screen-tv-face is-${status.key} is-large`;\n  }\n"""
new_dialog = """  } else if (currentFace) {\n    currentFace.classList.remove('is-unbound', 'is-online', 'is-offline');\n    currentFace.classList.add(`is-${status.key}`);\n    currentFace.classList.add('is-large');\n  }\n"""
if old_card not in text:
    raise SystemExit('card status replacement not found')
if old_dialog not in text:
    raise SystemExit('dialog status replacement not found')
text = text.replace(old_card, new_card, 1).replace(old_dialog, new_dialog, 1)
p.write_text(text, encoding='utf-8')
