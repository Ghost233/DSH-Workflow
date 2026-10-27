# 研究样例的第三方来源与许可

本目录保存源码审计、临时实验收据和导入样例。样例不属于本项目的运行插件，也未加入启动或打包清单。

`original-selected-entry/` 是 Google Harness² 确定性 demo 的选定产物；`generated-presets/original/` 和 `generated-presets/components/` 是通过转换器生成的研究样例。两个生成包声明的 Apache-2.0 许可证正文见本目录 [LICENSE](LICENSE)。此次只补许可证副本与来源说明，原始产物和生成文件保持原样。

固定来源：

- [Google Harness²](https://github.com/google-research/harness2/tree/1cfe254e8d25b15f37048c3730134686abe60335)，提交 `1cfe254e8d25b15f37048c3730134686abe60335`，[许可证](https://github.com/google-research/harness2/blob/1cfe254e8d25b15f37048c3730134686abe60335/LICENSE)。
- [xisnn/harness2-dsh](https://github.com/xisnn/harness2-dsh/tree/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa)，提交 `56e77dccbb33d51ba1063eb5ae8c87fcd74771aa`，[许可证](https://github.com/xisnn/harness2-dsh/blob/56e77dccbb33d51ba1063eb5ae8c87fcd74771aa/LICENSE)。

两份固定来源的许可证字节相同。随附副本的 SHA-256 为 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`。实验条件、原始失败及未验能力仍以 [analysis.md](analysis.md) 和 `evidence/` 为准；附入研究资料不表示这些 preset 已在 DSH rc.3 中激活。
