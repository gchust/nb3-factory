# Visual evidence verification

- Factory regression suite: 79 tests passed in Actions run 34098563836.
- Real browser smoke: actual PNG screenshot and WebM recording generated with agent-browser 0.36.0 and ffmpeg.
- Focused ESLint checks: passed.
- GitHub CLI 2.100.0 attachment flag: verified against the official distribution.
- Live native attachment upload requires the repository secret FACTORY_MEDIA_TOKEN and was not exercised without a real user token.

See [configuration and usage](VISUAL_REPORTS.md).
