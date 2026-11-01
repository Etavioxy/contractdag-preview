//! 按区两遍：节点表读完再解连线；一处不合文法即停，模型不产出。

use crate::defects::inspect;
use crate::model::{
    ContractModel, DagNode, DependencyEdge, Diagnostic, DiagnosticLayer, Direction, ParseResult,
    SourceRange, StyleSheet,
};
use crate::syntax::{self, Parsed};
use std::collections::{BTreeMap, BTreeSet};

const KNOWN_REGIONS: [&str; 3] = ["nodes", "links", "style"];

struct SyntaxFailure {
    code: &'static str,
    message: String,
    range: SourceRange,
}

fn fail<T>(
    code: &'static str,
    message: impl Into<String>,
    range: SourceRange,
) -> Result<T, SyntaxFailure> {
    Err(SyntaxFailure {
        code,
        message: message.into(),
        range,
    })
}

fn split_lines(source: &str) -> Vec<String> {
    let body = source.strip_prefix('\u{FEFF}').unwrap_or(source);
    body.replace("\r\n", "\n")
        .split('\n')
        .map(String::from)
        .collect()
}

fn line_at(lines: &[String], index: usize) -> &str {
    lines.get(index).map_or("", String::as_str)
}

fn line_range_at(lines: &[String], index: usize) -> SourceRange {
    syntax::line_range(index, syntax::text_len(line_at(lines, index)))
}

fn last_line_range(lines: &[String]) -> SourceRange {
    let index = lines.len().saturating_sub(1);
    line_range_at(lines, index)
}

fn skip_ignorable(lines: &[String], from: usize) -> usize {
    let mut cursor = from;
    while cursor < lines.len() && syntax::is_ignorable(line_at(lines, cursor)) {
        cursor += 1;
    }
    cursor
}

pub fn parse(source: &str) -> ParseResult {
    let mut style = StyleSheet::default();
    let lines = split_lines(source);

    match build_model(&lines, &mut style) {
        Ok(model) => ParseResult {
            diagnostics: inspect(&model),
            model: Some(model),
            style,
        },
        Err(failure) => ParseResult {
            model: None,
            style,
            diagnostics: vec![Diagnostic {
                layer: DiagnosticLayer::Syntax,
                code: String::from(failure.code),
                message: failure.message,
                range: failure.range,
            }],
        },
    }
}

fn build_model(lines: &[String], style: &mut StyleSheet) -> Result<ContractModel, SyntaxFailure> {
    let mut nodes: Vec<DagNode> = Vec::new();
    let mut links: Vec<DependencyEdge> = Vec::new();

    let mut cursor = expect_region(lines, 0, "nodes")?;
    cursor = read_nodes(lines, cursor, &mut nodes)?;
    cursor = expect_region(lines, cursor, "links")?;
    cursor = read_links(lines, cursor, &mut links)?;

    cursor = skip_ignorable(lines, cursor);
    if cursor < lines.len() {
        if syntax::region_open(line_at(lines, cursor)) != Some("style") {
            return fail(
                "unexpected-text",
                format!(
                    "连线区之后只收可选的 <style> 区，这一行读不懂：{}",
                    syntax::js_trim(line_at(lines, cursor))
                ),
                line_range_at(lines, cursor),
            );
        }
        cursor = read_style(lines, cursor, style)?;
        cursor = skip_ignorable(lines, cursor);
    }

    if cursor < lines.len() {
        return fail(
            "unexpected-text",
            format!(
                "样式区之后不能再有内容：{}",
                syntax::js_trim(line_at(lines, cursor))
            ),
            line_range_at(lines, cursor),
        );
    }

    Ok(ContractModel { nodes, links })
}

fn expect_region(lines: &[String], from: usize, expected: &str) -> Result<usize, SyntaxFailure> {
    let cursor = skip_ignorable(lines, from);
    if cursor >= lines.len() {
        return fail(
            "missing-region",
            format!("缺少 <{expected}> 区"),
            last_line_range(lines),
        );
    }

    let text = line_at(lines, cursor);
    let range = syntax::line_range(cursor, syntax::text_len(text));
    let Some(open) = syntax::region_open(text) else {
        return fail(
            "unknown-region",
            format!(
                "这里应该是 <{expected}>，读到的不是区标签：{}",
                syntax::js_trim(text)
            ),
            range,
        );
    };
    if open == expected {
        return Ok(cursor + 1);
    }
    if KNOWN_REGIONS.contains(&open) {
        return fail(
            "region-order",
            format!("区的顺序是 nodes、links、style，这里应该是 <{expected}>，写成了 <{open}>"),
            range,
        );
    }
    fail(
        "unknown-region",
        format!("区名写错了：<{open}>，这里应该是 <{expected}>"),
        range,
    )
}

struct Entry {
    key: String,
    values: Vec<String>,
    key_range: SourceRange,
}

fn read_nodes(
    lines: &[String],
    from: usize,
    out: &mut Vec<DagNode>,
) -> Result<usize, SyntaxFailure> {
    let mut cursor = from;
    loop {
        cursor = skip_ignorable(lines, cursor);
        if cursor >= lines.len() {
            return fail(
                "unterminated-region",
                "节点区没收尾，缺 </nodes>",
                last_line_range(lines),
            );
        }

        let text = line_at(lines, cursor);
        let range = syntax::line_range(cursor, syntax::text_len(text));
        if let Some(close) = syntax::region_close(text) {
            if close == "nodes" {
                return Ok(cursor + 1);
            }
            return fail("region-order", format!("节点区里出现了 </{close}>"), range);
        }

        match syntax::parse_node_head(text) {
            Parsed::Ok(head) => {
                let (entries, next) = read_entries(lines, cursor + 1, true)?;
                out.push(build_node(&head, range, entries)?);
                cursor = next;
            }
            Parsed::Bad { code, message } => {
                if !syntax::js_trim(text).starts_with('[') {
                    return fail(
                        "unexpected-text",
                        format!(
                            "节点区只收 [名字:种类] 表头与键值行：{}",
                            syntax::js_trim(text)
                        ),
                        range,
                    );
                }
                return fail(code, message, range);
            }
        }
    }
}

fn read_links(
    lines: &[String],
    from: usize,
    out: &mut Vec<DependencyEdge>,
) -> Result<usize, SyntaxFailure> {
    let mut cursor = from;
    loop {
        cursor = skip_ignorable(lines, cursor);
        if cursor >= lines.len() {
            return fail(
                "unterminated-region",
                "连线区没收尾，缺 </links>",
                last_line_range(lines),
            );
        }

        let text = line_at(lines, cursor);
        let range = syntax::line_range(cursor, syntax::text_len(text));
        if let Some(close) = syntax::region_close(text) {
            if close == "links" {
                return Ok(cursor + 1);
            }
            return fail("region-order", format!("连线区里出现了 </{close}>"), range);
        }

        match syntax::parse_link_head(text) {
            Parsed::Ok(head) => {
                let (entries, next) = read_entries(lines, cursor + 1, true)?;
                out.push(build_link(&head, range, entries)?);
                cursor = next;
            }
            Parsed::Bad { code, message } => {
                if !syntax::js_trim(text).starts_with("[[") {
                    return fail(
                        "unexpected-text",
                        format!(
                            "连线区只收 [[源 -> 目的]] 表头与键值行：{}",
                            syntax::js_trim(text)
                        ),
                        range,
                    );
                }
                return fail(code, message, range);
            }
        }
    }
}

fn read_entries(
    lines: &[String],
    from: usize,
    allow_block_values: bool,
) -> Result<(Vec<Entry>, usize), SyntaxFailure> {
    let mut entries: Vec<Entry> = Vec::new();
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut cursor = from;

    loop {
        let probe = skip_ignorable(lines, cursor);
        if probe >= lines.len() {
            return Ok((entries, probe));
        }
        let text = line_at(lines, probe);
        if !syntax::looks_like_key_value(text) {
            return Ok((entries, probe));
        }

        let key_range = syntax::line_range(probe, syntax::text_len(text));
        let parsed = syntax::parse_key_value(text);
        let key_value = match parsed {
            Parsed::Ok(key_value) => key_value,
            Parsed::Bad { code, message } => return fail(code, message, key_range),
        };
        if !seen.insert(key_value.key.clone()) {
            return fail(
                "duplicate-key",
                format!("同一个块里重复写了 {}", key_value.key),
                key_range,
            );
        }

        let (values, next) = read_value(
            lines,
            probe,
            &key_value.value,
            allow_block_values,
            key_range,
        )?;
        entries.push(Entry {
            key: key_value.key,
            values,
            key_range,
        });
        cursor = next;
    }
}

fn read_value(
    lines: &[String],
    line: usize,
    raw: &str,
    allow_block_values: bool,
    key_range: SourceRange,
) -> Result<(Vec<String>, usize), SyntaxFailure> {
    if raw != "[" {
        return Ok((vec![String::from(raw)], line + 1));
    }
    if !allow_block_values {
        return fail("bad-value", "连线区只收单行值", key_range);
    }

    let mut values: Vec<String> = Vec::new();
    for cursor in line + 1..lines.len() {
        let text = line_at(lines, cursor);
        if syntax::js_trim(text) == "]" {
            return Ok((values, cursor + 1));
        }
        if syntax::region_close(text).is_some() {
            break;
        }
        if !syntax::is_ignorable(text) {
            values.push(String::from(syntax::js_trim(text)));
        }
    }
    fail("unterminated-value", "多行值没收尾，缺 ]", key_range)
}

fn build_node(
    head: &syntax::NodeHead,
    range: SourceRange,
    entries: Vec<Entry>,
) -> Result<DagNode, SyntaxFailure> {
    let mut key_ranges: BTreeMap<String, SourceRange> = BTreeMap::new();
    let mut path: Vec<String> = Vec::new();
    let mut destination: Vec<String> = Vec::new();

    for entry in entries {
        match entry.key.as_str() {
            "path" => path.extend(entry.values),
            "destination" => destination.extend(entry.values),
            other => {
                return fail(
                    "unknown-key",
                    format!("节点区只收 path 与 destination，不认 {other}"),
                    entry.key_range,
                );
            }
        }
        key_ranges.insert(entry.key, entry.key_range);
    }
    if !key_ranges.contains_key("destination") {
        return fail(
            "missing-destination",
            format!("节点 {} 没写 destination", head.name),
            range,
        );
    }

    Ok(DagNode {
        name: head.name.clone(),
        kind: head.kind,
        path,
        destination,
        range,
        key_ranges,
    })
}

fn build_link(
    head: &syntax::LinkHead,
    range: SourceRange,
    entries: Vec<Entry>,
) -> Result<DependencyEdge, SyntaxFailure> {
    let mut artifacts: Vec<String> = Vec::new();
    let mut properties: BTreeMap<String, String> = BTreeMap::new();
    let mut key_ranges: BTreeMap<String, SourceRange> = BTreeMap::new();

    for entry in entries {
        if entry.key == "from" || entry.key == "to" {
            return fail(
                "reserved-key",
                format!("连线区不认 {}：端点已经写在表头里", entry.key),
                entry.key_range,
            );
        }
        if entry.key == "artifact" {
            artifacts.extend(entry.values.into_iter().filter(|value| !value.is_empty()));
            key_ranges.insert(entry.key, entry.key_range);
            continue;
        }
        // 只有 artifact 可以写成多行：其余键机器忽略，多行没有意义。
        if entry.values.len() > 1 {
            return fail(
                "bad-value",
                format!("只有 artifact 可以写多行，{} 只能单行", entry.key),
                entry.key_range,
            );
        }
        properties.insert(
            entry.key.clone(),
            entry.values.first().cloned().unwrap_or_default(),
        );
        key_ranges.insert(entry.key, entry.key_range);
    }
    if artifacts.is_empty() {
        return fail(
            "missing-artifact",
            format!("连线 {} -> {} 没写 artifact", head.from, head.to),
            range,
        );
    }

    Ok(DependencyEdge {
        from: head.from.clone(),
        to: head.to.clone(),
        artifacts,
        properties,
        range,
        key_ranges,
    })
}

fn read_style(
    lines: &[String],
    from: usize,
    style: &mut StyleSheet,
) -> Result<usize, SyntaxFailure> {
    let mut cursor = from + 1;
    loop {
        cursor = skip_ignorable(lines, cursor);
        if cursor >= lines.len() {
            return fail(
                "unterminated-region",
                "样式区没收尾，缺 </style>",
                last_line_range(lines),
            );
        }

        let text = line_at(lines, cursor);
        let range = syntax::line_range(cursor, syntax::text_len(text));
        if let Some(close) = syntax::region_close(text) {
            if close == "style" {
                return Ok(cursor + 1);
            }
            return fail("region-order", format!("样式区里出现了 </{close}>"), range);
        }

        match syntax::parse_style_command(text) {
            Parsed::Ok(command) => apply_style_command(style, command, range)?,
            Parsed::Bad { code, message } => return fail(code, message, range),
        }
        cursor += 1;
    }
}

fn apply_style_command(
    style: &mut StyleSheet,
    command: syntax::StyleCommand,
    range: SourceRange,
) -> Result<(), SyntaxFailure> {
    match command {
        syntax::StyleCommand::Direction(value) => {
            let written = value.to_uppercase();
            let direction = match written.as_str() {
                "TB" | "TD" => Direction::Tb,
                "BT" => Direction::Bt,
                "LR" => Direction::Lr,
                "RL" => Direction::Rl,
                _ => {
                    return fail(
                        "bad-style-value",
                        format!("direction 只有 TB / BT / LR / RL（TD 同 TB），写成了 {value}"),
                        range,
                    );
                }
            };
            style.direction = direction;
            Ok(())
        }
        syntax::StyleCommand::Gap(value) => {
            if value.is_empty() || !value.chars().all(|character| character.is_ascii_digit()) {
                return fail(
                    "bad-style-value",
                    format!("gap 要写一个非负整数，写成了 {value}"),
                    range,
                );
            }
            style.gap = value.parse::<u64>().unwrap_or(u64::MAX);
            Ok(())
        }
        syntax::StyleCommand::Font(value) => {
            style.font = Some(value);
            Ok(())
        }
        syntax::StyleCommand::ClassDef { name, properties } => {
            style.class_defs.insert(name, properties);
            Ok(())
        }
        syntax::StyleCommand::Class { node, classes } => {
            style.classes.push(crate::model::ClassAssignment {
                node,
                classes,
                range,
            });
            Ok(())
        }
        syntax::StyleCommand::LinkStyle {
            from,
            to,
            properties,
        } => {
            style.link_styles.push(crate::model::LinkStyle {
                from,
                to,
                properties,
                range,
            });
            Ok(())
        }
    }
}
