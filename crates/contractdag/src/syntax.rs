//! 行级词法：把一行文本认成区标签、表头、键值行或样式命令，不持有状态。

use crate::model::{NodeKind, SourceRange};
use std::collections::BTreeMap;

pub enum Parsed<T> {
    Ok(T),
    Bad { code: &'static str, message: String },
}

pub fn ok<T>(value: T) -> Parsed<T> {
    Parsed::Ok(value)
}

pub fn bad<T>(code: &'static str, message: String) -> Parsed<T> {
    Parsed::Bad { code, message }
}

/// 按 UTF-16 码元数的列宽：与 JavaScript 的 `String.length` 同一口径。
pub fn text_len(text: &str) -> usize {
    text.encode_utf16().count()
}

pub fn line_range(line: usize, length: usize) -> SourceRange {
    SourceRange {
        start_line: line,
        start_character: 0,
        end_line: line,
        end_character: length,
    }
}

/// JavaScript 的 `\s`：比 `char::is_whitespace` 多 U+FEFF、少 U+0085。
pub fn is_js_space(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// JavaScript 的 `String.prototype.trim`。
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

pub fn is_ignorable(text: &str) -> bool {
    let trimmed = js_trim(text);
    trimmed.is_empty() || trimmed.starts_with('#')
}

pub fn region_open(text: &str) -> Option<&str> {
    let trimmed = js_trim(text);
    let inner = trimmed.strip_prefix('<')?.strip_suffix('>')?;
    if inner.is_empty() || inner.contains(['<', '>', '/']) {
        return None;
    }
    Some(inner)
}

pub fn region_close(text: &str) -> Option<&str> {
    let trimmed = js_trim(text);
    let inner = trimmed.strip_prefix("</")?.strip_suffix('>')?;
    if inner.is_empty() || inner.contains(['<', '>', '/']) {
        return None;
    }
    Some(inner)
}

pub struct NodeHead {
    pub name: String,
    pub kind: NodeKind,
}

pub fn parse_node_head(text: &str) -> Parsed<NodeHead> {
    let trimmed = js_trim(text);
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') || trimmed.starts_with("[[") {
        return bad(
            "bad-node-head",
            String::from("节点头要写成 [名字] 或 [名字:种类]"),
        );
    }
    let inner = &trimmed[1..trimmed.len() - 1];
    let (name, kind_text) = match inner.rfind(':') {
        Some(colon) => (js_trim(&inner[..colon]), js_trim(&inner[colon + 1..])),
        None => (js_trim(inner), ""),
    };
    if name.is_empty() {
        return bad("empty-name", String::from("节点没有名字"));
    }
    let kind = match kind_text {
        "" => NodeKind::Change,
        "change" => NodeKind::Change,
        "query" => NodeKind::Query,
        "root" => NodeKind::Root,
        other => {
            return bad(
                "bad-kind",
                format!("种类只有 change / query / root，写成了 {other}"),
            );
        }
    };
    ok(NodeHead {
        name: String::from(name),
        kind,
    })
}

pub struct LinkHead {
    pub from: String,
    pub to: String,
}

pub fn parse_link_head(text: &str) -> Parsed<LinkHead> {
    let trimmed = js_trim(text);
    if !trimmed.starts_with("[[") || !trimmed.ends_with("]]") {
        return bad(
            "bad-link-head",
            String::from("连线表头要写成 [[源 -> 目的]]"),
        );
    }
    let inner = &trimmed[2..trimmed.len() - 2];
    let parts: Vec<&str> = inner.split("->").collect();
    if parts.len() != 2 {
        return bad("bad-link-head", String::from("连线表头要有且只有一个 ->"));
    }
    let from = js_trim(parts[0]);
    let to = js_trim(parts[1]);
    if from.is_empty() || to.is_empty() {
        return bad("bad-link-head", String::from("连线两端都要有节点名"));
    }
    ok(LinkHead {
        from: String::from(from),
        to: String::from(to),
    })
}

pub struct KeyValue {
    pub key: String,
    pub value: String,
}

/// 键值行：够不够像，只看有没有半角等号且不以表头的方括号起头。
pub fn looks_like_key_value(text: &str) -> bool {
    let trimmed = js_trim(text);
    !trimmed.starts_with('[') && trimmed.contains('=')
}

/// 键名：英文字母起头，其余是英文字母、数字、下划线或连字符。
fn is_key(key: &str) -> bool {
    let mut characters = key.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || character == '_' || character == '-'
        })
}

pub fn parse_key_value(text: &str) -> Parsed<KeyValue> {
    let trimmed = js_trim(text);
    let Some(equals) = trimmed.find('=') else {
        return bad("bad-key-value", String::from("键值行要写成 键 = 值"));
    };
    if equals == 0 {
        return bad("bad-key-value", String::from("键值行要写成 键 = 值"));
    }
    let key = js_trim(&trimmed[..equals]);
    let value = js_trim(&trimmed[equals + 1..]);
    if !is_key(key) {
        return bad(
            "bad-key",
            format!("键名要用英文字母、数字、下划线或连字符：{key}"),
        );
    }
    if value.is_empty() {
        return bad("missing-value", format!("键 {key} 没写值"));
    }
    ok(KeyValue {
        key: String::from(key),
        value: String::from(value),
    })
}

pub enum StyleCommand {
    Direction(String),
    Gap(String),
    Font(String),
    ClassDef {
        name: String,
        properties: BTreeMap<String, String>,
    },
    Class {
        node: String,
        classes: Vec<String>,
    },
    LinkStyle {
        from: String,
        to: String,
        properties: BTreeMap<String, String>,
    },
}

fn is_property_name(name: &str) -> bool {
    let mut characters = name.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphabetic())
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn parse_properties(text: &str) -> Parsed<BTreeMap<String, String>> {
    let complaint = || format!("属性要写成 名:值，多项用逗号分开：{text}");
    if text.is_empty() {
        return bad("bad-style-value", complaint());
    }

    let mut properties = BTreeMap::new();
    for item in text.split(',') {
        let Some(colon) = item.find(':') else {
            return bad("bad-style-value", complaint());
        };
        let name = &item[..colon];
        if !is_property_name(name) {
            return bad("bad-style-value", complaint());
        }
        properties.insert(
            String::from(js_trim(name)),
            String::from(js_trim(&item[colon + 1..])),
        );
    }
    ok(properties)
}

fn split_endpoints(text: &str) -> Parsed<LinkHead> {
    let parts: Vec<&str> = text.split("->").collect();
    if parts.len() != 2 {
        return bad("bad-style-value", String::from("端点要写成 源 -> 目的"));
    }
    let from = js_trim(parts[0]);
    let to = js_trim(parts[1]);
    if from.is_empty() || to.is_empty() {
        return bad("bad-style-value", String::from("端点两端都要有节点名"));
    }
    ok(LinkHead {
        from: String::from(from),
        to: String::from(to),
    })
}

/// JavaScript 的 `split(/\s+/)`：按一段段空白切开，丢掉空段。
fn split_js_whitespace(text: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut start: Option<usize> = None;
    for (index, character) in text.char_indices() {
        if is_js_space(character) {
            if let Some(begin) = start.take() {
                parts.push(&text[begin..index]);
            }
        } else if start.is_none() {
            start = Some(index);
        }
    }
    if let Some(begin) = start {
        parts.push(&text[begin..]);
    }
    parts
}

pub fn parse_style_command(text: &str) -> Parsed<StyleCommand> {
    let trimmed = js_trim(text);
    let Some(space) = trimmed
        .char_indices()
        .find(|(_, character)| is_js_space(*character))
        .map(|(index, _)| index)
    else {
        return bad("bad-style-line", String::from("样式行要写成 关键字 参数"));
    };
    let keyword = &trimmed[..space];
    let rest = js_trim(&trimmed[space..]);

    match keyword {
        "direction" => ok(StyleCommand::Direction(String::from(rest))),
        "gap" => ok(StyleCommand::Gap(String::from(rest))),
        "font" => ok(StyleCommand::Font(String::from(rest))),
        "classDef" => {
            let parts = split_js_whitespace(rest);
            let Some(name) = parts.first() else {
                return bad(
                    "bad-style-line",
                    String::from("classDef 要写成 classDef 类名 名:值"),
                );
            };
            if name.is_empty() {
                return bad(
                    "bad-style-line",
                    String::from("classDef 要写成 classDef 类名 名:值"),
                );
            }
            match parse_properties(&parts[1..].join(" ")) {
                Parsed::Ok(properties) => ok(StyleCommand::ClassDef {
                    name: String::from(*name),
                    properties,
                }),
                Parsed::Bad { code, message } => bad(code, message),
            }
        }
        "class" => {
            // 节点名可以含空格，类名取最后一个词。
            let Some(cut) = rest.rfind(' ') else {
                return bad(
                    "bad-style-line",
                    String::from("class 要写成 class 节点名 类名"),
                );
            };
            if cut == 0 {
                return bad(
                    "bad-style-line",
                    String::from("class 要写成 class 节点名 类名"),
                );
            }
            ok(StyleCommand::Class {
                node: String::from(js_trim(&rest[..cut])),
                classes: vec![String::from(js_trim(&rest[cut + 1..]))],
            })
        }
        "linkStyle" => {
            let Some(cut) = rest.rfind(' ') else {
                return bad(
                    "bad-style-line",
                    String::from("linkStyle 要写成 linkStyle 源 -> 目的 名:值"),
                );
            };
            if cut == 0 {
                return bad(
                    "bad-style-line",
                    String::from("linkStyle 要写成 linkStyle 源 -> 目的 名:值"),
                );
            }
            let endpoints = split_endpoints(&rest[..cut]);
            let properties = parse_properties(js_trim(&rest[cut + 1..]));
            match (endpoints, properties) {
                (Parsed::Ok(endpoints), Parsed::Ok(properties)) => ok(StyleCommand::LinkStyle {
                    from: endpoints.from,
                    to: endpoints.to,
                    properties,
                }),
                (Parsed::Bad { code, message }, _) => bad(code, message),
                (_, Parsed::Bad { code, message }) => bad(code, message),
            }
        }
        other => bad(
            "unknown-style-key",
            format!("样式区不认这个关键字：{other}"),
        ),
    }
}
