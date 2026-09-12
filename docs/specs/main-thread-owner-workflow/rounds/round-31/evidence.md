# F21

只改L1 bind基线采样前的只读inspect，coordinator:787等待retirement后只读准备；不用load提交恢复事件，不在replay后flush。生产合同不改。正式session26，180秒，保留前轮失败。本轮直接正式，无无意义重复定向。
