# omp-colors

A Claude Code mod that colors Claude's replies like the omp (oh-my-pi) dark theme, so lines are easier to find in a wall of text:

- Inline code, commands and paths: green
- List dashes and numbers: blue
- Bold: bold only, no color
- Tables: drawn with box lines, bold header, green code in cells
- Shell code blocks: green command words, soft yellow strings
- Italics, strikethrough, links (blue name, gray address), quote blocks and rules

Tool calls stay folded, as Claude Code draws them by default.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install omp-colors --marketplace tadsn3w/omp-colors
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install omp-colors --marketplace tadsn3w/omp-colors
```

## Optional theme

`extras/omp-theme.json` makes normal text bright white, uses omp's accent colors, and gives your own messages an indigo background so they are easy to find. Copy it to `~/.claude/themes/omp.json`, restart Claude Code once, then pick **omp vibrant** in `/theme`.
