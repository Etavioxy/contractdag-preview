//! 契约模型的类型与外部形状：字段名与 TypeScript 侧同构，两边 JSON 可直接对照。

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 文本里的一个位置区间，行与列都从 0 起，与 VS Code 的 Range 同一口径。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRange {
    pub start_line: usize,
    pub start_character: usize,
    pub end_line: usize,
    pub end_character: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DagNode {
    pub name: String,
    /// 冒号后的自由文本，只作呈现用的标注，不参与任何判定。
    pub annotation: String,
    pub path: Vec<String>,
    pub destination: Vec<String>,
    pub range: SourceRange,
    pub key_ranges: BTreeMap<String, SourceRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyEdge {
    pub from: String,
    pub to: String,
    /// 交接的产物：一条边可以带多个，`artifact` 必填且至少一个。
    pub artifacts: Vec<String>,
    /// 连线区的其余自由键值。
    pub properties: BTreeMap<String, String>,
    pub range: SourceRange,
    pub key_ranges: BTreeMap<String, SourceRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContractModel {
    pub nodes: Vec<DagNode>,
    pub links: Vec<DependencyEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Direction {
    Tb,
    Bt,
    Lr,
    Rl,
}

impl Direction {
    pub const fn as_str(self) -> &'static str {
        match self {
            Direction::Tb => "TB",
            Direction::Bt => "BT",
            Direction::Lr => "LR",
            Direction::Rl => "RL",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassAssignment {
    pub node: String,
    pub classes: Vec<String>,
    pub range: SourceRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkStyle {
    pub from: String,
    pub to: String,
    pub properties: BTreeMap<String, String>,
    pub range: SourceRange,
}

/// 样式区不是契约模型的一部分，只是呈现参数。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleSheet {
    pub direction: Direction,
    pub gap: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    pub class_defs: BTreeMap<String, BTreeMap<String, String>>,
    pub classes: Vec<ClassAssignment>,
    pub link_styles: Vec<LinkStyle>,
}

/// 层间默认空隙：要同时放下弧线、箭头与若干个产物标签。
pub const DEFAULT_GAP: u64 = 48;

impl Default for StyleSheet {
    fn default() -> Self {
        Self {
            direction: Direction::Tb,
            gap: DEFAULT_GAP,
            font: None,
            class_defs: BTreeMap::new(),
            classes: Vec::new(),
            link_styles: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticLayer {
    Syntax,
    Structural,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub layer: DiagnosticLayer,
    pub code: String,
    pub message: String,
    pub range: SourceRange,
}

/// 解析器交出的全部东西：模型、样式、两层诊断。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseResult {
    /// 文法不合法时缺省：连模型都产不出来。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<ContractModel>,
    /// 样式区是呈现参数，不是契约模型的一部分。
    pub style: StyleSheet,
    pub diagnostics: Vec<Diagnostic>,
}
