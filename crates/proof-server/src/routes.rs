//! API route definitions for SMT-based proof generation.

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
        // SMT-based proof generation endpoints
        .route("/api/prove/state-transition", post(handlers::prove_state_transition))
        .route("/api/prove/item-exists", post(handlers::prove_item_exists))
        .route("/api/prove/capacity", post(handlers::prove_capacity))
        // Utility endpoints
        .route("/api/commitment/create", post(handlers::create_commitment))
        .route("/api/blinding/generate", post(handlers::generate_blinding))
}
