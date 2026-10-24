# 来源与署名

本目录派生自 [FeatherHunter/dsh-mattpocock-skills-deck](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck)，上游基准为 ed0ad92bd1bac8702630ab10caca76492b5134cc（1.9.0-beta.11，发布标签）。

保留上游 MIT 许可证和源码中的署名。Ghost233 在 DSH Workflow 中维护面板专用改动。日志产物来自 dsh-log 0.4.1，MIT 许可证保留为包内的 `dsh-log.LICENSE`。YAML 解析来自 yaml 2.9.1，ISC 许可证随包保留为 `yaml.LICENSE`。

构建将两项生产依赖内嵌到 `package/vendor/`，生成的宿主代码使用包内相对引用。源码仍按原包名导入，运行端无需安装依赖。
