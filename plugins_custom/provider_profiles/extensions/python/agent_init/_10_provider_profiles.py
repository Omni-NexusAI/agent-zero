from helpers.extension import Extension


class ProviderProfilesInit(Extension):
    def execute(self, **kwargs):
        if self.agent:
            self.agent.set_data("provider_profiles_plugin", {"loaded": True})