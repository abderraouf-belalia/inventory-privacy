//! API route definitions.

use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};
use tokio::sync::RwLock;

use crate::handlers;
use crate::AppState;

/// Create API routes
pub fn api_routes() -> Router<Arc<RwLock<AppState>>> {
    Router::new()
        // Health check
        .route("/health", get(handlers::health))
        // Proof generation endpoints
        .route("/api/prove/item-exists", post(handlers::prove_item_exists))
        .route("/api/prove/withdraw", post(handlers::prove_withdraw))
        .route("/api/prove/deposit", post(handlers::prove_deposit))
        .route("/api/prove/transfer", post(handlers::prove_transfer))
        // Capacity-aware proof endpoints
        .route("/api/prove/capacity", post(handlers::prove_capacity))
        .route("/api/prove/deposit-capacity", post(handlers::prove_deposit_with_capacity))
        .route("/api/prove/transfer-capacity", post(handlers::prove_transfer_with_capacity))
        // Utility endpoints
        .route("/api/commitment/create", post(handlers::create_commitment))
        .route("/api/blinding/generate", post(handlers::generate_blinding))
        .route("/api/registry-hash", post(handlers::compute_registry_hash_handler))
}
