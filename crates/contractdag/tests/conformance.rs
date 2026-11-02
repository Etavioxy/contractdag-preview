use contractdag::parse;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn corpus() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/corpus")
}

#[test]
fn corpus_matches_the_typescript_expectations() {
    let mut checked = 0;
    for entry in fs::read_dir(corpus()).expect("语料目录不存在，跑 pnpm conformance") {
        let path = entry.expect("读不到语料目录项").path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("contractdag") {
            continue;
        }

        let name = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .expect("文件名不是 UTF-8")
            .to_owned();
        let source = fs::read_to_string(&path).expect("读不到样例");
        let expected_path = corpus().join(format!("{name}.expected.json"));
        let expected: Value =
            serde_json::from_str(&fs::read_to_string(&expected_path).expect("读不到期望 JSON"))
                .expect("期望 JSON 不是合法 JSON");
        let actual = serde_json::to_value(parse(&source)).expect("解析结果序列化失败");

        assert_eq!(actual, expected, "{name} 的解析结果与期望 JSON 不一致");
        checked += 1;
    }

    assert!(
        checked >= 7,
        "语料里只有 {checked} 份样例，跑 pnpm conformance"
    );
}
