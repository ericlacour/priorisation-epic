package com.priorisationepic.adapter.out.persistence;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

interface ChangeLogSpringRepository extends JpaRepository<ChangeLogEntity, UUID> {}
