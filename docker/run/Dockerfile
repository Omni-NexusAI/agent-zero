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

# Build variant for version banner and settings: hybridGPU, fullGPU, or empty for CPU-only
ARG BUILD_VARIANT=""
ENV BUILD_VARIANT=$BUILD_VARIANT

# PyTorch variant: cpu or cuda (used to install correct PyTorch version)
ARG PYTORCH_VARIANT=cpu
ENV PYTORCH_VARIANT=$PYTORCH_VARIANT

# Bake BUILD_VARIANT and PYTORCH_VARIANT into /etc/environment so they persist at runtime
RUN echo "BUILD_VARIANT=\"$BUILD_VARIANT\"" >> /etc/environment && \
    echo "PYTORCH_VARIANT=\"$PYTORCH_VARIANT\"" >> /etc/environment

# Install PyTorch with CUDA support for FullGPU builds
# This replaces the CPU-only PyTorch from the base image
RUN if [ "$BUILD_VARIANT" = "fullGPU" ] || [ "$PYTORCH_VARIANT" = "cuda" ]; then \
        echo "Installing PyTorch with CUDA support for FullGPU build..."; \
        /opt/venv-a0/bin/pip install --no-cache-dir \
            torch==2.4.0+cu124 \
            torchvision==0.19.0+cu124 \
            torchaudio==2.4.0+cu124 \
            --index-url https://download.pytorch.org/whl/cu124; \
        echo "PyTorch CUDA installation complete"; \
    else \
        echo "Skipping CUDA PyTorch (BUILD_VARIANT=$BUILD_VARIANT, PYTORCH_VARIANT=$PYTORCH_VARIANT)"; \
    fi

# Recreate venv on Python 3.11 via uv (whisper wheels not available for 3.13)
RUN rm -rf /opt/venv && uv venv --python 3.11 /opt/venv \
    && /opt/venv/bin/python -m ensurepip \
    && /opt/venv/bin/pip3 install --upgrade pip

# Copy filesystem files to root
COPY ./fs/ /

# Make compute_build_version.sh executable
RUN chmod +x /ins/compute_build_version.sh

# pre installation steps
RUN bash /ins/pre_install.sh $GIT_REF

# install A0 (this will compute and store build version in /tmp/A0_BUILD_VERSION.txt)
RUN bash /ins/install_A0.sh $GIT_REF

# Save computed build version to a persistent file in the image
# This file will be read at runtime by startup scripts
RUN if [ -f /tmp/A0_BUILD_VERSION.txt ]; then \
        BUILD_VERSION=$(cat /tmp/A0_BUILD_VERSION.txt | tr -d '\n\r'); \
        echo "Build version computed: $BUILD_VERSION"; \
        echo "$BUILD_VERSION" > /a0_build_version.txt; \
        chmod 644 /a0_build_version.txt; \
    else \
        echo "WARNING: A0_BUILD_VERSION.txt not found during build"; \
        echo "Version D unknown-custom unknown" > /a0_build_version.txt; \
    fi

# install additional software
RUN bash /ins/install_additional.sh $GIT_REF

# cleanup repo and install A0 without caching, this speeds up builds
ARG CACHE_DATE=none
RUN echo "cache buster $CACHE_DATE" && bash /ins/install_A02.sh $GIT_REF

# Recompute version after install_A02.sh (in case repo was re-cloned)
# Pass BUILD_VARIANT to include in version string (hybridGPU, fullGPU, or empty)
RUN if [ -d /git/agent-zero/.git ]; then \
        BUILD_VERSION=$(BUILD_VARIANT="$BUILD_VARIANT" bash /ins/compute_build_version.sh /git/agent-zero | tr -d '\n\r'); \
        echo "Final build version: $BUILD_VERSION"; \
        echo "$BUILD_VERSION" > /a0_build_version.txt; \
        chmod 644 /a0_build_version.txt; \
    fi

# post installation steps
RUN bash /ins/post_install.sh $GIT_REF

# Expose ports
EXPOSE 22 80 9000-9009

RUN chmod +x /exe/initialize.sh /exe/run_A0.sh /exe/run_searxng.sh /exe/run_tunnel_api.sh

# initialize runtime and switch to supervisord
CMD ["/exe/initialize.sh", "$GIT_REF"]
