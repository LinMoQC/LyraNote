pub fn normalize_text(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_whitespace_without_changing_words() {
        assert_eq!(
            normalize_text("  LyraNote\n\n desktop\tplatform  "),
            "LyraNote desktop platform".to_string()
        );
    }
}
