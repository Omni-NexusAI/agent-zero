try:
    from python.helpers.extension import Extension
except ImportError:
    from helpers.extension import Extension


class EnhancedSpeechInit(Extension):
    def execute(self, **kwargs):
        return
