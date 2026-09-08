export default async function () {
    const { install } = await import('/plugins/_convo/webui/convo-store.js');
    install();
}
