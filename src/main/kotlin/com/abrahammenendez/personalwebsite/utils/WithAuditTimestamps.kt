package com.abrahammenendez.personalwebsite.utils

import org.springframework.data.mongodb.core.mapping.event.AbstractMongoEventListener
import org.springframework.data.mongodb.core.mapping.event.BeforeConvertEvent
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * This interface provides `createdOn` and `updatedOn` timestamp fields.
 * When this object is saved to MongoDB, these fields are automatically set and updated using [AuditTimestampsEventListener].
 *
 * Note that the `updatedOn` field will be set on any save operation, irrespective of whether the fields on the object have changed.
 *
 * Ensure that you override the required variables in your constructor:
 * ```
 * override var createdOn: Instant? = null,
 * override var updatedOn: Instant? = null,
 * ```
 *
 * @property createdOn When this object was first persisted
 * @property updatedOn When this object was last persisted
 *
 * @see AuditTimestampsEventListener
 */
interface WithAuditTimestamps {

    var createdOn: Instant?
    var updatedOn: Instant?
}

/**
 * An event listener that updates the `createdOn` and `updatedOn` fields of objects
 * using the [WithAuditTimestamps] interface, before they are serialised and saved to MongoDB.
 *
 * The `updatedOn` field will be set on any save operation, irrespective of whether the fields on the object have changed.
 * The `createdOn` field will only be set the first time it is null
 *
 * @see WithAuditTimestamps
 */
@Component
class AuditTimestampsEventListener : AbstractMongoEventListener<WithAuditTimestamps>() {

    override fun onBeforeConvert(event: BeforeConvertEvent<WithAuditTimestamps>) {
        val now = Instant.now()
        event.source.updatedOn = now
        if (event.source.createdOn == null) {
            event.source.createdOn = now
        }
        super.onBeforeConvert(event)
    }
}
