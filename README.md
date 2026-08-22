# ritvikdayal.github.io

Personal site — [ritvikdayal.github.io](https://ritvikdayal.github.io/)

A single static page. Seven WebGL layers between a tap and an answer, then the work:
selected projects, open source, career track, stack, contact.

## Layout

```
index.html                 the whole page — markup, styles, and the scroll/nav script
hero-engine.js             the seven-layer "Under the Hood" sequence
career-engine.js           the career timeline stage
noise.png                  film grain, sampled by both engines
Ritvik-Dayal-Resume.pdf    linked from the contact section
vendor/three/              three.js 0.160.0 + the postprocessing addons the engines import
```

## Dependencies

three.js and its five postprocessing addons are vendored under `vendor/three/` and wired
through the import map in `index.html`. Nothing is fetched from a CDN at runtime except
the two Google fonts, so a CDN outage costs typography, not the page.

## Running it

Any static server, from the repository root:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` from the filesystem will not work —
ES modules and the import map need an HTTP origin.

## Deployment

GitHub Pages builds from `master` at the repository root. Merging to `master` publishes.
