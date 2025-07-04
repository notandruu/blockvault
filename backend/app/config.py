from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    alchemy_webhook_signing_key: str = ""
    alchemy_base_mainnet_rpc: str = ""
    alchemy_base_sepolia_rpc: str = ""
    backend_caller_private_key: str
    factory_address_base: str = ""
    factory_address_base_sepolia: str = ""
    chain_id: int = 8453
    poll_interval_seconds: int = 60

    @property
    def rpc_url(self) -> str:
        if self.chain_id == 8453:
            return self.alchemy_base_mainnet_rpc
        return self.alchemy_base_sepolia_rpc

    @property
    def factory_address(self) -> str:
        if self.chain_id == 8453:
            return self.factory_address_base
        return self.factory_address_base_sepolia


settings = Settings()
