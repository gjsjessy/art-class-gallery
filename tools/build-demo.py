# Builds a single-file demo page (sample data, no Supabase) from docs/.
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "docs"
css = (root / "styles.css").read_text()
cfg = (root / "config.js").read_text()
app = (root / "app.js").read_text()
import base64
logo = "data:image/png;base64," + base64.b64encode((root / "logo.png").read_bytes()).decode()
cfg = cfg.replace('logo: "logo.png"', f'logo: "{logo}"')
out = f"""<title>Sasha &amp; Lulu Parent Gallery</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Oswald:wght@400;500;600&display=swap">
<style>
{css}
</style>
<div id="app"></div>
<script>
{cfg}
window.APP_DEMO = true;
</script>
<script>
{app}
</script>
"""
dest = pathlib.Path(__file__).resolve().parent.parent / "demo.html"
dest.write_text(out)
print(dest, len(out))
