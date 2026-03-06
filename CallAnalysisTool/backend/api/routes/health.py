"""
Health check endpoint
"""

from flask import Blueprint, jsonify

health_bp = Blueprint('health', __name__)

@health_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint to verify API is running
    
    Returns:
        JSON response with status
    """
    return jsonify({
        'status': 'healthy',
        'service': 'EMS Call Analysis API',
        'version': '1.0.0'
    }), 200

