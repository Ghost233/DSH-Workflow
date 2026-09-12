# Upstream references

`SoL-Pi/` is the unmodified NVIDIA [SoL-Pi](https://github.com/NVlabs/SoL-Pi) Git submodule. Its gitlink pins the upstream version; the DSH port lives in `../sol-efficiency-plugin/`, whose `upstream.json` records the reviewed source revision. Initialize it with `git submodule update --init vendor/SoL-Pi`. Review changes and run the plugin tests before advancing the pin.
