//! `.contractdag` 的模型类型与解析器：与 VS Code 扩展同一套文法，不依赖编辑器。

mod defects;
mod model;
mod parser;
mod syntax;

pub use model::{
    ClassAssignment, ContractModel, DEFAULT_GAP, DagNode, DependencyEdge, Diagnostic,
    DiagnosticLayer, Direction, LinkStyle, ParseResult, SourceRange, StyleSheet,
};
pub use parser::parse;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deploy_fixture_parses_into_four_nodes_and_three_links() {
        let source = include_str!("../tests/corpus/deploy.contractdag");
        let result = parse(source);

        assert!(result.diagnostics.is_empty());
        let model = result.model.expect("模型应当产出");
        assert_eq!(model.nodes.len(), 4);
        assert_eq!(model.links.len(), 3);
        assert_eq!(model.nodes[0].name, "源码构建节点");
        assert_eq!(model.nodes[0].annotation, "change");
        assert_eq!(model.nodes[2].annotation, "query");
        assert_eq!(model.nodes[3].annotation, "root");
    }

    #[test]
    fn columns_are_utf16_code_units_not_bytes() {
        let source = "<nodes>\n[甲:change]\ndestination = 收工。\n</nodes>\n<links>\n</links>";
        let result = parse(source);
        let model = result.model.expect("模型应当产出");

        assert_eq!(
            model.nodes[0].range.end_character,
            "[甲:change]".encode_utf16().count()
        );
        assert_eq!(model.nodes[0].key_ranges["destination"].start_line, 2);
    }

    #[test]
    fn bom_and_crlf_do_not_change_the_model() {
        let source = "\u{FEFF}<nodes>\r\n\r\n[甲:change]\r\npath = /tmp/a\r\ndestination = 收工。\r\n\r\n</nodes>\r\n\r\n<links>\r\n</links>\r\n";
        let result = parse(source);

        // 这份样例只有一个节点、没有出边，结构层不再报断头；这里只验 CRLF 与 BOM 不进模型。
        assert!(result.diagnostics.is_empty());
        let model = result.model.expect("模型应当产出");
        assert_eq!(model.nodes[0].range.start_line, 2);
        assert_eq!(model.nodes[0].path, vec![String::from("/tmp/a")]);
    }

    #[test]
    fn syntax_error_yields_no_model_and_one_diagnostic() {
        let source = "<node>\n\n[甲:change]\npath = /tmp/a\ndestination = 收工。\n\n</node>";
        let result = parse(source);

        assert!(result.model.is_none());
        assert_eq!(result.diagnostics.len(), 1);
        assert_eq!(result.diagnostics[0].layer, DiagnosticLayer::Syntax);
        assert_eq!(result.diagnostics[0].code, "unknown-region");
        assert_eq!(result.diagnostics[0].range.start_line, 0);
    }

    #[test]
    fn style_applied_before_a_failure_stays_in_the_result() {
        let source = "<nodes>\n[甲:change]\npath = /tmp/a\ndestination = 收工。\n</nodes>\n<links>\n</links>\n<style>\ndirection LR\ngap 三十二\n</style>";
        let result = parse(source);

        assert!(result.model.is_none());
        assert_eq!(result.style.direction, Direction::Lr);
        assert_eq!(result.style.gap, DEFAULT_GAP);
        assert_eq!(result.diagnostics[0].code, "bad-style-value");
    }
}
