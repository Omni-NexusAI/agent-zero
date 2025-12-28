# Use the pre-built base image for A0
# FROM agent-zero-base:local
FROM agent0ai/agent-zero-base:latest

# Check if the argument is provided, else throw an error
# GIT_REF can be a branch name (e.g., "development", "main") or a tag (e.g., "v0.9.7-custom")
ARG GIT_REF
RUN if [ -z "$GIT_REF" ]; then echo "ERROR: GIT_REF is not set!" >&2; exit 1; fi
ENV GIT_REF=$GIT_REF
# Backward compatibility: also set BRANCH for scripts that still use it
ENV BRANCH=$GIT_REF

# Recreate venv on Python 3.11 via uv (whisper wheels not available for 3.13)
RUN rm -rf /opt/venv && uv venv --python 3.11 /opt/venv \
    && /opt/venv/bin/python -m ensurepip \
    && /opt/venv/bin/pip3 install --upgrade pip

# Copy filesystem files to root
COPY ./fs/ /

# pre installation steps
RUN bash /ins/pre_install.sh $GIT_REF

# install A0 (this will compute and store build version in /tmp/A0_BUILD_VERSION.txt)
RUN bash /ins/install_A0.sh $GIT_REF

# install additional software
RUN bash /ins/install_additional.sh $GIT_REF

# cleanup repo and install A0 without caching, this speeds up builds
ARG CACHE_DATE=none
RUN echo "cache buster $CACHE_DATE" && bash /ins/install_A02.sh $GIT_REF

# post installation steps
RUN bash /ins/post_install.sh $GIT_REF

# Expose ports
EXPOSE 22 80 9000-9009

RUN chmod +x /exe/initialize.sh /exe/run_A0.sh /exe/run_searxng.sh /exe/run_tunnel_api.sh

# initialize runtime and switch to supervisord
CMD ["/exe/initialize.sh", "$GIT_REF"]
