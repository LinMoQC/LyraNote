#![allow(dead_code)]

pub mod diff;
pub mod file_probe;
pub mod hashing;
pub mod pdf_probe;
pub mod preprocess;

pub use file_probe::probe_file_metadata;
pub use hashing::compute_sha256_for_path;
