class SwaggerTokenPrefixMiddleware:
    """
    Middleware to automatically append the 'Token ' prefix to the Authorization header
    if the user forgets to add it in Swagger UI.
    DRF tokens are exactly 40 characters long.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        # Agar tokenda probel bo'lmasa va u aynan 40 ta belgidan iborat bo'lsa (DRF Token uzunligi)
        # oldiga 'Token ' so'zini avtomatik qo'shib qo'yamiz.
        if auth_header and ' ' not in auth_header and len(auth_header) == 40:
            request.META['HTTP_AUTHORIZATION'] = f"Token {auth_header}"
            
        return self.get_response(request)
