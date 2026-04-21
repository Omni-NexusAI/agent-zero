try:
    from python.helpers.extension import Extension
except ImportError:
    from helpers.extension import Extension


class EnhancedMcpConfigInit(Extension):
    def execute(self, **kwargs):
        return
