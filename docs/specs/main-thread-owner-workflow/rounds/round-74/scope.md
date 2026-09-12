# R74：共同准入与启动前拒绝

修复R73 P2。共同候选独立准入要求approved及passed Review绑定active planDigest，在dispatch、最新reserve、claim与lease/save binding路径复用。Owner尚未建立的实际启动前失败不生成completed/failed receipt，停下自身预留并明确投影技术暂停，不能同源反复派发。已存在未知Owner保留现场不伪造结果。

主线程拥有Runtime/helper/selector tests/合同与证据；worker只拥有candidate-recovery-pause.test.mjs。正式：Runtime、selector、candidate pause、workflow-state、control，180秒每套串行，保留实际内层隔离。冻结后独立复审。
