# Layer 1 全景数据源映射（韩系 · Vehicle_ID → 汽车之家车系 → 全景）

> 配套：`docs/全球主要汽车品牌 Layer 1 车型数据库（合并版).md`　|　生成：2026-09-09

> 数据完整性：本次共探测 **7136** 个汽车之家车系；韩系候选车系 pano 探测 0 失败（无 ERR）。

## 规则（Licht 定，勿擅自改）

1. **不同造型的代际 = 汽车之家不同车系/不同全景 → 各自独立拍摄**。韩系中表现为：伊兰特(78119) 与 领动(45479) 是两个车系两套全景，各拍一次。
2. **同一全景内的多个机位只是配色差异 → 只取最浅那一台，不重复拍**（如 iCAR V27：12 机位=4配色×3角色）。
3. **无全景的车型直接忽略**（概念车/过老代际/未引入全景源的进口变体等）。
4. **同车系仅有一套全景、但 Layer 1 含多个代际 ID 时**：汽车之家只提供当前在售造型的 360° 全景（旧代际无独立全景源），因此该组只拍一次、按最浅色；旧代际 ID 在资产索引中标注「复用当前造型全景」。若你认为某旧代际实际造型差异显著且需要，请人工指定其它数据源。

## 统计

- Vehicle_ID 总数：**187**（现代 78 / 起亚 82 / 捷尼赛思 27）
- 有全景：**115** 个 ID，归并为 **35** 个造型分组（= 建议拍摄数，每组合格证`IMG_{品牌}_{车型}_{代际}_{视角}_...`一张）
- 无全景（忽略）：**72** 个 ID
- 弱匹配需人工确认归属：**57** 个 ID（见 §三）

## 一、造型分组（建议拍摄清单，共 35 组）

| # | 车系名 | 车系ID | 全景ID | 全景对应代际(推测) | 组内 Vehicle_ID 数 | 覆盖 Vehicle_ID（层1 数据库） |
|---:|---|---|---|---:|---:|---|
| G01 | 昂希诺纯电动 | 5111 | 42121 | 昂希诺纯电 2019-2022 | 2 | HYD_Encino_RC_2018<br>HYD_Encino_EV_2019 |
| G02 | 北京现代ix35 | 1007 | 74166 | ix35 2010-2015 | 2 | HYD_IX35_LM_2010<br>HYD_IX35_LM_Facelift_2013 |
| G03 | 菲斯塔 | 4817 | 58698 | 菲斯塔 2022-2025 | 3 | HYD_Lafesta_CN_2018<br>HYD_Lafesta_Facelift_2022<br>HYD_Lafesta_EV_2022 |
| G04 | 福瑞迪 | 813 | 38646 | 福瑞迪 2019-2021 | 4 | KIA_Forte_TD_2008<br>KIA_Forte_TD_Facelift_2011<br>KIA_Cerato_YD_2016<br>KIA_Cerato_YD_Facelift_2019 |
| G05 | 嘉华 | 284 | 74289 | 嘉华 2020-2026 | 6 | KIA_Carnival_VQ_2006<br>KIA_Carnival_YP_2010<br>KIA_Carnival_YP_Facelift_2013<br>KIA_Carnival_KA4_2020<br>KIA_Carnival_KA4_Facelift_2024<br>KIA_Carnival_Hybrid_KA4_2023 |
| G06 | 捷尼赛思G70 | 4545 | 65724 | G70 2023-2026 | 3 | GEN_G70_IK_2017<br>GEN_G70_IK_Facelift_2020<br>GEN_G70_IK_Facelift2_2023 |
| G07 | 捷尼赛思G80 | 4176 | 73096 | G80 2024-2026 | 2 | GEN_G80_RG3_2020<br>GEN_G80_RG3_Facelift_2024 |
| G08 | 捷尼赛思G90 | 3982 | 73616 | G90 2022-2026 | 3 | GEN_G90_HI_Facelift_2018<br>GEN_G90_RS4_2022<br>GEN_G90_RS4_Facelift_2025 |
| G09 | 捷尼赛思GV60 | 5865 | 66108 | GV60 2025-2026 | 2 | GEN_GV60_JW1_2022<br>GEN_GV60_JW1_Facelift_2025 |
| G10 | 捷尼赛思GV70 | 5475 | 70888 | GV70 2024-2026 | 2 | GEN_GV70_EN4_2021<br>GEN_GV70_EN4_Facelift_2024 |
| G11 | 捷尼赛思GV80 | 4397 | 78634 | GV80 2024-2026 | 2 | GEN_GV80_EN4_2020<br>GEN_GV80_EN4_Facelift_2024 |
| G12 | 库斯途 | 6118 | 68238 | 库斯途 2020-2026 | 2 | HYD_Custo_PU_2020<br>HYD_Custin_PU_2021 |
| G13 | 领动 | 3959 | 45479 | 领动 2016-2020 | 1 | HYD_Avante_AD_2016 |
| G14 | 名图 | 3073 | 49405 | 名图 2020-2023 | 4 | HYD_Mistra_DF_2013<br>HYD_Mistra_DF_Facelift_2017<br>HYD_Mistra_DF2_2020<br>HYD_Mistra_EV_2021 |
| G15 | 起亚EV5 | 7352 | 71310 | EV5 2024-2026 | 1 | KIA_EV5_SV1_2024 |
| G16 | 起亚EV6 | 6050 | 63789 | EV6 2024-2026 | 2 | KIA_EV6_CV1_2021<br>KIA_EV6_CV1_Facelift_2024 |
| G17 | 起亚K3 | 2886 | 79043 | K3 EV 2022-2025 | 5 | KIA_K3_BD_2012<br>KIA_K3_BD_Facelift_2015<br>KIA_K3_YD_2019<br>KIA_K3_YD_Facelift_2021<br>KIA_K3_EV_2022 |
| G18 | 起亚K4 | 3286 | 27336 | K4 2025-2026 | 3 | KIA_K4_BD_2013<br>KIA_K4_BD_Facelift_2016<br>KIA_K4_2025 |
| G19 | 起亚K5 | 2246 | 69775 | K5 2016-2020 | 4 | KIA_Optima_TF_2011<br>KIA_Optima_TF_Facelift_2014<br>KIA_Optima_JF_2016<br>KIA_Optima_JF_Facelift_2018 |
| G20 | 起亚K900 | 3265 | 34071 | K9 2018-2022 | 3 | KIA_K9_KH_2012<br>KIA_K9_KH_Facelift_2015<br>KIA_K9_RJ_2018 |
| G21 | 起亚KX5 | 3954 | 51578 | KX5 2019-2021 | 2 | KIA_KX5_NL_2016<br>KIA_KX5_NL_Facelift_2019 |
| G22 | 起亚KX7 | 4200 | 49881 | KX7 2017-2020 | 1 | KIA_KX7_XM_2017 |
| G23 | 瑞纳 | 2115 | 43749 | 瑞纳 2020-2026 | 4 | HYD_Verna_MC_2005<br>HYD_Verna_RB_2010<br>HYD_Verna_RC_2017<br>HYD_Verna_AC_2020 |
| G24 | 胜达 | 2927 | 70963 | 胜达 2023-2026 | 7 | HYD_SantaFe_CM_2006<br>HYD_SantaFe_DM_2012<br>HYD_SantaFe_DM_Facelift_2015<br>HYD_SantaFe_TM_2018<br>HYD_SantaFe_TM_Facelift_2020<br>HYD_SantaFe_LX5_2023<br>HYD_SantaFe_LX5_Hybrid_2024 |
| G25 | 索纳塔 | 2649 | 78125 | 索纳塔 2023-2026 | 8 | HYD_Sonata_NF_2005<br>HYD_Sonata_NF_Facelift_2008<br>HYD_Sonata_YF_2009<br>HYD_Sonata_LF_2015<br>HYD_Sonata_LF_Facelift_2017<br>HYD_Sonata_DN8_2020<br>HYD_Sonata_DN8_Facelift_2023<br>HYD_Sonata_Hybrid_DN8_2020 |
| G26 | 途胜 | 358 | 78121 | 途胜L 2021-2026 | 7 | HYD_Tucson_JM_2005<br>HYD_Tucson_JM_Facelift_2008<br>HYD_Tucson_TL_2015<br>HYD_Tucson_TL_Facelift_2018<br>HYD_Tucson_NX4_2021<br>HYD_Tucson_NX4_Facelift_2024<br>HYD_Tucson_Hybrid_NX4_2022 |
| G27 | 伊兰特 | 51 | 78119 | 伊兰特 2021-2026 | 7 | HYD_Elantra_HD_2005<br>HYD_Elantra_YF_Elantra_2011<br>HYD_Elantra_AD_2016<br>HYD_Elantra_AD_Facelift_2019<br>HYD_Elantra_CN7_2021<br>HYD_Elantra_CN7_Facelift_2024<br>HYD_Elantra_Hybrid_CN7_2021 |
| G28 | 悦动 | 586 | 46761 | 悦动 2011-2015 | 2 | HYD_Elantra_Yuedong_2008<br>HYD_Elantra_Yuedong_Facelift_2011 |
| G29 | 智跑 | 2137 | 60830 | 智跑 2013-2016 | 2 | KIA_Sportage_SL_2010<br>KIA_Sportage_SL_Facelift_2013 |
| G30 | IONIQ 5 N(艾尼氪5N) | 7325 | 75728 | Ioniq 5 2024-2026 | 2 | HYD_Ioniq5_NE_2021<br>HYD_Ioniq5_NE_Facelift_2024 |
| G31 | IONIQ(艾尼氪)6 | 6786 | 57753 | Ioniq 2019-2022 | 2 | HYD_Ioniq_AE_2017<br>HYD_Ioniq_AE_Facelift_2019 |
| G32 | KONA N | 7281 | 63082 | Kona 2023-2026 | 6 | HYD_Kona_OS_2018<br>HYD_Kona_OS_Facelift_2020<br>HYD_Kona_EV_OS_2019<br>HYD_Kona_NX4_2023<br>HYD_Kona_EV_NX4_2023<br>HYD_Kona_N_NX4_2024 |
| G33 | KX3傲跑 | 3664 | 51410 | KX3 傲跑 2023-2025 | 2 | KIA_KX3_SP2_2020<br>KIA_KX3_SP2_Facelift_2023 |
| G34 | Soul | 666 | 37167 | Soul（秀尔） 2019-2026 | 5 | KIA_Soul_AM_2009<br>KIA_Soul_PS_2014<br>KIA_Soul_SK3_2019<br>KIA_Soul_EV_2015<br>KIA_Soul_EV_2020 |
| G35 | Telluride | 4004 | 37655 | Telluride 2023-2026 | 2 | KIA_Telluride_LD_2019<br>KIA_Telluride_LD_Facelift_2023 |

> 组名取汽车之家车系名；「全景对应代际」取组内在售/最新 ID 的 model+年款——汽车之家 360° 全景反映的是该车系**当前在售造型**。同组内更早代际若与当前造型不同，汽车之家未提供其独立全景，按规则 4 归并。

## 二、无全景（忽略，不截图）

| Vehicle_ID | 车型(model) | 代际区间 | 状态 | 原因猜测 |
|---|---|---|---|---|
| HYD_Palisade_LD_2019 | Palisade | 2019-2023 | Discontinued | 汽车之家无此车系 |
| HYD_Palisade_LD_Facelift_2022 | Palisade | 2022-2025 | On Sale | 汽车之家无此车系 |
| HYD_Palisade_LD2_2025 | Palisade | 2025-2026 | On Sale | 汽车之家无此车系 |
| HYD_Nexo_FE_2018 | Nexo | 2018-2023 | Discontinued | 汽车之家无此车系 |
| HYD_Nexo_FE_Facelift_2022 | Nexo | 2022-2026 | On Sale | 汽车之家无此车系 |
| HYD_Ioniq5_XRT_2025 | Ioniq 5 XRT | 2025-2026 | On Sale | 汽车之家无此车系 |
| HYD_Ioniq6_CE_2022 | Ioniq 6 | 2022-2025 | On Sale | 汽车之家无此车系 |
| HYD_Ioniq6_CE_Facelift_2025 | Ioniq 6 | 2025-2026 | On Sale | 汽车之家无此车系 |
| HYD_Staria_US4_2022 | Staria | 2022-2026 | On Sale | 汽车之家无此车系 |
| HYD_Staria_Hybrid_US4_2024 | Staria 混动 | 2024-2026 | On Sale | 汽车之家无此车系 |
| HYD_Veloster_JK_2012 | 飞思 | 2012-2018 | Discontinued | 汽车之家无此车系 |
| HYD_Veloster_JS_2019 | 飞思 | 2019-2022 | Discontinued | 汽车之家无此车系 |
| HYD_Veloster_N_JS_2020 | 飞思 N | 2020-2022 | Discontinued | 汽车之家无此车系 |
| KIA_K5_DL3_2020 | K5 凯酷 | 2020-2024 | On Sale | 汽车之家无此车系 |
| KIA_K5_DL3_Facelift_2024 | K5 凯酷 | 2024-2026 | On Sale | 汽车之家无此车系 |
| KIA_Seltos_SP2_2019 | Seltos | 2019-2024 | Discontinued | 汽车之家无此车系 |
| KIA_Seltos_SP2_Facelift_2023 | Seltos | 2023-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sportage_NQ5_2022 | 狮跑 | 2022-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sportage_NQ5_Facelift_2025 | 狮跑 | 2025-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sportage_Hybrid_NQ5_2023 | 狮跑 混动 | 2023-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sorento_XM_2010 | 索兰托 | 2010-2014 | Discontinued | 汽车之家无此车系 |
| KIA_Sorento_XM_Facelift_2013 | 索兰托 | 2013-2016 | Discontinued | 汽车之家无此车系 |
| KIA_Sorento_XM_FL2_2016 | 索兰托 | 2016-2020 | Discontinued | 汽车之家无此车系 |
| KIA_Sorento_MQ4_2020 | Sorento | 2020-2024 | On Sale | 汽车之家无此车系 |
| KIA_Sorento_MQ4_Facelift_2023 | Sorento | 2023-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sorento_Hybrid_MQ4_2021 | Sorento 混动 | 2021-2026 | On Sale | 汽车之家无此车系 |
| KIA_EV6_GT_CV1_2023 | EV6 GT | 2023-2026 | On Sale | 汽车之家无此车系 |
| KIA_EV9_MV1_2023 | EV9 | 2023-2026 | On Sale | 汽车之家无此车系 |
| KIA_EV9_GT_MV1_2025 | EV9 GT | 2025-2026 | On Sale | 汽车之家无此车系 |
| KIA_EV5_GT_SV1_2025 | EV5 GT | 2025-2026 | On Sale | 汽车之家无此车系 |
| KIA_Stinger_CK_2017 | Stinger | 2017-2020 | Discontinued | 汽车之家无此车系 |
| KIA_Stinger_CK_Facelift_2020 | Stinger | 2020-2023 | Discontinued | 汽车之家无此车系 |
| KIA_Stinger_GT_CK_2018 | Stinger GT | 2018-2023 | Discontinued | 汽车之家无此车系 |
| KIA_Cerato_TD_2009 | 赛拉图 | 2009-2012 | Discontinued | 汽车之家无此车系 |
| KIA_Pegas_2011 | 锐欧 | 2011-2017 | Discontinued | 汽车之家无此车系 |
| KIA_Pegas_Facelift_2015 | 锐欧 | 2015-2018 | Discontinued | 汽车之家无此车系 |
| KIA_Rio_FB_2017 | 锐欧 | 2017-2020 | Discontinued | 汽车之家无此车系 |
| KIA_Niro_DE_2017 | Niro | 2017-2020 | Discontinued | 汽车之家无此车系 |
| KIA_Niro_EV_DE_2019 | Niro EV | 2019-2022 | Discontinued | 汽车之家无此车系 |
| KIA_Niro_SG2_2022 | Niro | 2022-2026 | On Sale | 汽车之家无此车系 |
| KIA_Niro_EV_SG2_2022 | Niro EV | 2022-2026 | On Sale | 汽车之家无此车系 |
| KIA_Sportage_KM_2005 | 狮跑 | 2005-2010 | Discontinued | 汽车之家无此车系 |
| KIA_Sportage_KM_Facelift_2008 | 狮跑 | 2008-2010 | Discontinued | 汽车之家无此车系 |
| KIA_Mohave_HM_2008 | Borrego/Mohave | 2008-2011 | Discontinued | 汽车之家无此车系 |
| KIA_Mohave_HM_Facelift_2019 | Mohave | 2019-2023 | Discontinued | 汽车之家无此车系 |
| KIA_Cadenza_VG_2010 | K7/Cadenza | 2010-2013 | Discontinued | 汽车之家无此车系 |
| KIA_Cadenza_VG_Facelift_2013 | K7/Cadenza | 2013-2016 | Discontinued | 汽车之家无此车系 |
| KIA_Cadenza_YG_2016 | K7/Cadenza | 2016-2020 | Discontinued | 汽车之家无此车系 |
| GEN_G70_Shooting_Brake_2022 | G70 Shooting Brake | 2022-2026 | On Sale | 汽车之家无此车系 |
| GEN_G80_DH_2014 | Genesis (EQ900) | 2014-2020 | Discontinued | 汽车之家无此车系 |
| GEN_G80_EV_M3_2021 | Electrified G80 | 2021-2026 | On Sale | 汽车之家无此车系 |
| GEN_G90_HI_2016 | G90 (EQ900) | 2016-2020 | Discontinued | 汽车之家无此车系 |
| GEN_GV70_EV_EN4_2023 | Electrified GV70 | 2023-2026 | On Sale | 汽车之家无此车系 |
| GEN_GV80_Coupe_2025 | GV80 Coupe | 2025-2026 | On Sale | 汽车之家无此车系 |
| GEN_Genesis_BH_2008 | Genesis Sedan | 2008-2013 | Discontinued | 汽车之家无此车系 |
| GEN_Equus_VI_2009 | Equus (雅科仕) | 2009-2015 | Discontinued | 汽车之家无此车系 |
| GEN_Equus_VI_Facelift_2013 | Equus | 2013-2016 | Discontinued | 汽车之家无此车系 |
| HYD_Concept_N_Vision_74_2022 | N Vision 74 | 2022-— | Concept | 概念车 |
| HYD_Concept_Ioniq_XNB_2024 | Ioniq XNB | 2024-— | Concept | 概念车 |
| HYD_Concept_Initium_2024 | Initium | 2024-— | Concept | 概念车 |
| HYD_Concept_Seven_2021 | Seven Concept | 2021-— | Concept | 概念车 |
| HYD_Concept_Prophecy_2020 | Prophecy Concept | 2020-— | Concept | 概念车 |
| HYD_Concept_HED_45_2023 | HED-45 | 2023-— | Concept | 概念车 |
| KIA_Concept_EV9_2021 | EV9 Concept | 2021-— | Concept | 概念车 |
| KIA_Concept_EV5_2023 | EV5 Concept | 2023-— | Concept | 概念车 |
| KIA_Concept_Concept_KV5_2025 | KV5 Concept | 2025-— | Concept | 概念车 |
| KIA_Concept_HabaNiro_2019 | HabaNiro Concept | 2019-— | Concept | 概念车 |
| KIA_Concept_Imagine_2019 | Imagine by Kia | 2019-— | Concept | 概念车 |
| GEN_Concept_X_2016 | Genesis Concept X | 2016-— | Concept | 概念车 |
| GEN_Concept_X_Speedium_2022 | X Speedium Coupe | 2022-— | Concept | 概念车 |
| GEN_Concept_GV80_Coupe_2023 | GV80 Coupe Concept | 2023-— | Concept | 概念车 |
| GEN_Concept_New_York_2017 | New York Concept | 2017-— | Concept | 概念车 |

## 三、需人工确认归属（弱匹配：车系名无精确命中，靠子串猜，但拍到了全景）

> 这些 ID 已暂按最佳子串命中归组；请核对归属是否合理，必要时手工改 `config/kr_pano_map.json`。

| Vehicle_ID | 车型(model) | 代际 | 暂归组 | 其余带全景候选 |
|---|---|---|---|---|
| HYD_Sonata_LF_2015 | 索纳塔九 | 2015-2019 | 索纳塔(78125) | — |
| HYD_Sonata_LF_Facelift_2017 | 索纳塔九 | 2017-2019 | 索纳塔(78125) | — |
| HYD_Sonata_DN8_2020 | 索纳塔十 | 2020-2023 | 索纳塔(78125) | — |
| HYD_IX35_LM_2010 | ix35 | 2010-2015 | 北京现代ix35(74166) | — |
| HYD_IX35_LM_Facelift_2013 | ix35 | 2013-2015 | 北京现代ix35(74166) | — |
| HYD_Tucson_NX4_2021 | 途胜L | 2021-2026 | 途胜(78121) | — |
| HYD_Tucson_NX4_Facelift_2024 | 途胜L | 2024-2026 | 途胜(78121) | — |
| HYD_Tucson_Hybrid_NX4_2022 | 途胜L 混动 | 2022-2026 | 途胜(78121) | — |
| HYD_Ioniq5_NE_2021 | Ioniq 5 | 2021-2024 | IONIQ 5 N(艾尼氪5N)(75728) | — |
| HYD_Ioniq5_NE_Facelift_2024 | Ioniq 5 | 2024-2026 | IONIQ 5 N(艾尼氪5N)(75728) | — |
| HYD_Ioniq_AE_2017 | Ioniq | 2017-2019 | IONIQ(艾尼氪)6(57753) | IONIQ(艾尼氪)5(67009) / IONIQ(艾尼氪)V(77586) / IONIQ 5 N(艾尼氪5N)(75728) |
| HYD_Ioniq_AE_Facelift_2019 | Ioniq | 2019-2022 | IONIQ(艾尼氪)6(57753) | IONIQ(艾尼氪)5(67009) / IONIQ(艾尼氪)V(77586) / IONIQ 5 N(艾尼氪5N)(75728) |
| HYD_Kona_OS_2018 | Kona | 2018-2020 | KONA N(63082) | — |
| HYD_Kona_OS_Facelift_2020 | Kona | 2020-2023 | KONA N(63082) | — |
| HYD_Kona_EV_OS_2019 | Kona EV | 2019-2023 | KONA N(63082) | — |
| HYD_Kona_NX4_2023 | Kona | 2023-2026 | KONA N(63082) | — |
| HYD_Kona_EV_NX4_2023 | Kona EV | 2023-2026 | KONA N(63082) | — |
| HYD_Encino_RC_2018 | 昂希诺 | 2018-2021 | 昂希诺纯电动(42121) | ENCINO 昂希诺(34235) |
| HYD_Encino_EV_2019 | 昂希诺纯电 | 2019-2022 | 昂希诺纯电动(42121) | ENCINO 昂希诺(34235) |
| KIA_K3_BD_2012 | K3 | 2012-2016 | 起亚K3(79043) | 起亚K3新能源(43071) |
| KIA_K3_BD_Facelift_2015 | K3 | 2015-2018 | 起亚K3(79043) | 起亚K3新能源(43071) |
| KIA_K3_YD_2019 | K3 | 2019-2022 | 起亚K3(79043) | 起亚K3新能源(43071) |
| KIA_K3_YD_Facelift_2021 | K3 | 2021-2023 | 起亚K3(79043) | 起亚K3新能源(43071) |
| KIA_K3_EV_2022 | K3 EV | 2022-2025 | 起亚K3(79043) | 起亚K3新能源(43071) |
| KIA_KX5_NL_2016 | KX5 | 2016-2020 | 起亚KX5(51578) | — |
| KIA_KX5_NL_Facelift_2019 | KX5 | 2019-2021 | 起亚KX5(51578) | — |
| KIA_KX7_XM_2017 | KX7 | 2017-2020 | 起亚KX7(49881) | — |
| KIA_EV6_CV1_2021 | EV6 | 2021-2024 | 起亚EV6(63789) | — |
| KIA_EV6_CV1_Facelift_2024 | EV6 | 2024-2026 | 起亚EV6(63789) | — |
| KIA_EV5_SV1_2024 | EV5 | 2024-2026 | 起亚EV5(71310) | — |
| KIA_K4_BD_2013 | K4 | 2013-2017 | 起亚K4(27336) | — |
| KIA_K4_BD_Facelift_2016 | K4 | 2016-2018 | 起亚K4(27336) | — |
| KIA_K4_2025 | K4 | 2025-2026 | 起亚K4(27336) | — |
| KIA_Optima_TF_2011 | K5 | 2011-2015 | 起亚K5(69775) | 起亚K5新能源(34516) |
| KIA_Optima_TF_Facelift_2014 | K5 | 2014-2018 | 起亚K5(69775) | 起亚K5新能源(34516) |
| KIA_Optima_JF_2016 | K5 | 2016-2020 | 起亚K5(69775) | 起亚K5新能源(34516) |
| KIA_Optima_JF_Facelift_2018 | K5 | 2018-2020 | 起亚K5(69775) | 起亚K5新能源(34516) |
| KIA_K9_KH_2012 | K9 | 2012-2015 | 起亚K900(34071) | — |
| KIA_K9_KH_Facelift_2015 | K9 | 2015-2018 | 起亚K900(34071) | — |
| KIA_K9_RJ_2018 | K9 | 2018-2022 | 起亚K900(34071) | — |
| KIA_Soul_AM_2009 | Soul（秀尔） | 2009-2014 | Soul(37167) | — |
| KIA_Soul_PS_2014 | Soul（秀尔） | 2014-2019 | Soul(37167) | — |
| KIA_Soul_SK3_2019 | Soul（秀尔） | 2019-2026 | Soul(37167) | — |
| GEN_G70_IK_2017 | G70 | 2017-2020 | 捷尼赛思G70(65724) | — |
| GEN_G70_IK_Facelift_2020 | G70 | 2020-2023 | 捷尼赛思G70(65724) | — |
| GEN_G70_IK_Facelift2_2023 | G70 | 2023-2026 | 捷尼赛思G70(65724) | — |
| GEN_G80_RG3_2020 | G80 | 2020-2024 | 捷尼赛思G80(73096) | 捷尼赛思纯电G80(60448) |
| GEN_G80_RG3_Facelift_2024 | G80 | 2024-2026 | 捷尼赛思G80(73096) | 捷尼赛思纯电G80(60448) |
| GEN_G90_HI_Facelift_2018 | G90 | 2018-2020 | 捷尼赛思G90(73616) | — |
| GEN_G90_RS4_2022 | G90 | 2022-2026 | 捷尼赛思G90(73616) | — |
| GEN_G90_RS4_Facelift_2025 | G90 | 2025-2026 | 捷尼赛思G90(73616) | — |
| GEN_GV60_JW1_2022 | GV60 | 2022-2025 | 捷尼赛思GV60(66108) | — |
| GEN_GV60_JW1_Facelift_2025 | GV60 | 2025-2026 | 捷尼赛思GV60(66108) | — |
| GEN_GV70_EN4_2021 | GV70 | 2021-2024 | 捷尼赛思GV70(70888) | 捷尼赛思纯电GV70(60449) |
| GEN_GV70_EN4_Facelift_2024 | GV70 | 2024-2026 | 捷尼赛思GV70(70888) | 捷尼赛思纯电GV70(60449) |
| GEN_GV80_EN4_2020 | GV80 | 2020-2024 | 捷尼赛思GV80(78634) | 捷尼赛思GV80轿跑(67320) |
| GEN_GV80_EN4_Facelift_2024 | GV80 | 2024-2026 | 捷尼赛思GV80(78634) | 捷尼赛思GV80轿跑(67320) |

---
*本文件由 `probe/build_kr_md.cjs` 离线生成（输入为本地缓存，无网络请求），配合 `config/kr_pano_map.json` 使用。*