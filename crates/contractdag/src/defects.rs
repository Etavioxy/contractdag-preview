//! 三条结构判定：模型已产出之后才判得出来的问题。

use crate::model::{ContractModel, DependencyEdge, Diagnostic, DiagnosticLayer};
use std::collections::{BTreeMap, BTreeSet};

pub fn inspect(model: &ContractModel) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    diagnostics.extend(unknown_nodes(model));
    diagnostics.extend(duplicate_artifacts(model));
    diagnostics.extend(cycles(model));
    diagnostics.sort_by_key(|diagnostic| diagnostic.range.start_line);
    diagnostics
}

fn structural(code: &str, message: String, range: crate::model::SourceRange) -> Diagnostic {
    Diagnostic {
        layer: DiagnosticLayer::Structural,
        code: String::from(code),
        message,
        range,
    }
}

fn unknown_nodes(model: &ContractModel) -> Vec<Diagnostic> {
    let names: BTreeSet<&str> = model.nodes.iter().map(|node| node.name.as_str()).collect();
    let mut diagnostics = Vec::new();
    for link in &model.links {
        let missing: Vec<&str> = [link.from.as_str(), link.to.as_str()]
            .into_iter()
            .filter(|name| !names.contains(name))
            .collect();
        if missing.is_empty() {
            continue;
        }
        diagnostics.push(structural(
            "unknown-node",
            format!("连线引用了未声明的节点：{}", missing.join("、")),
            link.range,
        ));
    }
    diagnostics
}

fn duplicate_artifacts(model: &ContractModel) -> Vec<Diagnostic> {
    let mut first_seen: BTreeMap<&str, &DependencyEdge> = BTreeMap::new();
    let mut diagnostics = Vec::new();
    for link in &model.links {
        for artifact in &link.artifacts {
            match first_seen.get(artifact.as_str()) {
                None => {
                    first_seen.insert(artifact, link);
                }
                Some(first) => diagnostics.push(structural(
                    "duplicate-artifact",
                    format!(
                        "产物名重复：{artifact} 已挂在 {} -> {} 上",
                        first.from, first.to
                    ),
                    link.range,
                )),
            }
        }
    }
    diagnostics
}

fn cycles(model: &ContractModel) -> Vec<Diagnostic> {
    let mut outbound: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for link in &model.links {
        outbound
            .entry(link.from.as_str())
            .or_default()
            .push(link.to.as_str());
    }

    let reaches = |start: &str, goal: &str| -> bool {
        let mut seen: BTreeSet<&str> = BTreeSet::new();
        let mut queue = vec![start];
        while let Some(current) = queue.pop() {
            if current == goal {
                return true;
            }
            if !seen.insert(current) {
                continue;
            }
            if let Some(next) = outbound.get(current) {
                queue.extend(next.iter().copied());
            }
        }
        false
    };

    model
        .links
        .iter()
        .filter(|link| reaches(&link.to, &link.from))
        .map(|link| {
            structural(
                "cycle",
                format!("依赖边接成环：{} -> {}", link.from, link.to),
                link.range,
            )
        })
        .collect()
}
