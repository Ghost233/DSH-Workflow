# Upstream approval policy

This adapter derives its host integration from [dsh-approve-for-me](https://github.com/timeance/dsh-approve-for-me), MIT licensed, version 0.2.2, commit `a72c8d24dd64f59644b2b0bdb5985edc9bf3c66b`. LICENSE contains the upstream license.

The policy core, prefix form parsing and model route preservation helpers are bundled without changes from the read-only vendor checkout. Project-owned host and browser integration target official DSH `0.1.6-alpha.1`. Neither upstream checkout is modified. Build inputs are pinned by `upstream.json`.
